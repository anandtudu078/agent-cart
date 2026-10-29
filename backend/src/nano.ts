import { env } from "./config/env.js";

/**
 * Nano (XNO) settle leg for the cart — the third settlement path beside
 * PayPal (issue #17).
 *
 * Two halves, and neither one holds keys:
 *   1. quote  — convert the cart total to an exact XNO amount at the live
 *               rate, rounded *down* to 8 decimals so the amount we display
 *               is byte-for-byte the amount we later demand.
 *   2. verify — read the buyer's signed send block off the public ledger and
 *               check subtype / amount / destination / cemented.
 * The buyer signs the payment in their own wallet; this module only reads.
 *
 * shortcut: one public RPC endpoint (NANO_RPC_URL) and a 60s cached
 * CoinGecko rate with an XNO_USD_RATE fallback — add a second node and a
 * real price feed when this settles real money instead of sandbox orders.
 */

/** 1 XNO = 10^30 raw. */
export const RAW_PER_XNO = 10n ** 30n;

/** Quotes are floored to this many decimals; the displayed amount is exact. */
const QUOTE_DECIMALS = 8;
const QUOTE_STEP = 10n ** BigInt(30 - QUOTE_DECIMALS); // 10^22 raw per 8dp unit

const RATE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=nano&vs_currencies=usd";
const RATE_CACHE_MS = 60_000;
const RATE_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 8_000;

// shape check only: nano_/xrb_ + the 60-character body (52 key + 8 checksum).
// Deliberately permissive on the alphabet — this guards our own NANO_ADDRESS
// config and the ledger itself is the final arbiter of any address we compare.
const ADDRESS_RE = /^(nano|xrb)_[13456789abcdefghijkmnopqrstuvwxyz]{60}$/;
const HASH_RE = /^[0-9a-f]{64}$/i;

/** True when a string has the shape of a Nano account address. */
export function isNanoAddress(raw: unknown): raw is string {
  return typeof raw === "string" && ADDRESS_RE.test(raw.trim());
}

/** True when a string has the shape of a block hash (64 hex chars). */
export function isBlockHash(raw: unknown): raw is string {
  return typeof raw === "string" && HASH_RE.test(raw.trim());
}

/** True when the Nano leg can quote at all (NANO_ADDRESS is configured). */
export function nanoConfigured(): boolean {
  return isNanoAddress(env.nano.address);
}

/**
 * 8-decimal XNO string for a raw unit count ("12.34567890").
 * Rendering only — the raw value stays a bigint for comparisons.
 */
export function formatXno(units: bigint): string {
  const padded = units.toString().padStart(QUOTE_DECIMALS + 1, "0");
  return `${padded.slice(0, -QUOTE_DECIMALS)}.${padded.slice(-QUOTE_DECIMALS)}`;
}

/**
 * Convert a USD total at `rate` into the exact amount to send.
 * Returns null when the total cannot be quoted (bad inputs, or so small it
 * floors to 0 units — never quote an amount we could not accept).
 */
export function quoteXno(
  usd: number,
  rate: number,
): { xno: string; raw: bigint } | null {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const units = Math.floor((usd / rate) * 10 ** QUOTE_DECIMALS);
  if (units < 1) return null;
  return { xno: formatXno(BigInt(units)), raw: BigInt(units) * QUOTE_STEP };
}

let rateCache: { rate: number; at: number } | null = null;

/**
 * Nano/USD rate: live from CoinGecko's keyless endpoint, cached 60s,
 * falling back to XNO_USD_RATE when the feed is unreachable. Null when
 * neither is available — the caller reports it instead of guessing.
 */
export async function xnoRate(): Promise<number | null> {
  if (rateCache && Date.now() - rateCache.at < RATE_CACHE_MS) {
    return rateCache.rate;
  }
  try {
    const res = await fetch(RATE_URL, {
      signal: AbortSignal.timeout(RATE_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as { nano?: { usd?: unknown } };
      const usd = data.nano?.usd;
      if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
        rateCache = { rate: usd, at: Date.now() };
        return usd;
      }
    }
  } catch {
    // network/timeout → fall through to the configured rate
  }
  return env.nano.rateFallback > 0 ? env.nano.rateFallback : null;
}

export type BlockCheck =
  | { ok: true; amountRaw: bigint }
  | { ok: false; error: string };

/**
 * Confirm a block on the ledger is a settled send of at least `amountRaw`
 * to `address`.
 *
 * Checks, in order: the hash exists, subtype is `send`, the destination is
 * our account, the amount covers the quote (overpay is allowed — an honest
 * rounding in the buyer's favour must not fail), and the block is cemented.
 */
export async function verifySendBlock(
  hash: string,
  opts: { address: string; amountRaw: bigint },
): Promise<BlockCheck> {
  if (!isBlockHash(hash)) return { ok: false, error: "block hash must be 64 hex characters" };

  let body: unknown;
  try {
    const res = await fetch(env.nano.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "blocks_info",
        hashes: [hash.trim().toLowerCase()],
        json_block: true,
      }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `ledger RPC returned HTTP ${res.status}` };
    body = await res.json();
  } catch (err) {
    return {
      ok: false,
      error: `ledger RPC unreachable: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`,
    };
  }

  const parsed = body as {
    error?: unknown;
    blocks?: Record<
      string,
      {
        amount?: unknown;
        confirmed?: unknown;
        subtype?: unknown;
        block?: { subtype?: unknown; link_as_account?: unknown };
      }
    >;
  };
  if (typeof parsed.error === "string") {
    return { ok: false, error: `ledger RPC: ${parsed.error.slice(0, 160)}` };
  }

  const key = hash.trim().toLowerCase();
  const block = parsed.blocks?.[key] ?? parsed.blocks?.[key.toUpperCase()];
  if (!block) return { ok: false, error: "block not found on the ledger" };

  // nodes disagree on where `subtype` lives — accept either
  const subtype = block.subtype ?? block.block?.subtype;
  if (subtype !== "send") {
    return { ok: false, error: `block subtype is ${String(subtype)}, not send` };
  }

  const destination = block.block?.link_as_account;
  if (destination !== env.nano.address.trim()) {
    return { ok: false, error: "block pays a different address" };
  }

  const amount = BigInt(String(block.amount ?? "0"));
  if (amount < opts.amountRaw) {
    return { ok: false, error: "block pays less than the quoted amount" };
  }

  // absent `confirmed` = a node that does not report cementation; only a
  // definitive false blocks us
  if (block.confirmed === false) {
    return { ok: false, error: "block is not confirmed yet — try again shortly" };
  }

  return { ok: true, amountRaw: amount };
}
