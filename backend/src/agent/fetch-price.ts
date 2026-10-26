import { isPublicHttpUrl } from "./url-guard.js";

/**
 * Fetch a live price from a watch item's product URL.
 *
 * Structured data only — JSON-LD Product/offer first, then the standard
 * price meta tags. No regex over the whole document: the first random
 * number in the copy would end up on the watchlist.
 *
 * shortcut: one GET, 8s, no JS rendering, no per-retailer adapters —
 * upgrade to a retailer adapter (or a product API) when a page needs a
 * browser or blocks plain fetches.
 */
const TIMEOUT_MS = 8_000;

// a fetched number outside this band of the current price is treated as a
// parse failure (wrong currency, installment plan, page garbage) rather than
// a real move — an honest "stale" beats a fabricated 10x drop
// shortcut: ±80%; widen only with per-retailer parse confidence
const MAX_MOVE = 0.8;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const LD_JSON =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ATTR = /([a-z:-]+)=["']([^"']*)["']/gi;

export type PriceFetch =
  | { ok: true; price: number }
  | { ok: false; error: string };

/** Turn a human price string ("$1,299.00") into a number, or null. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  // last separator is the decimal point ("1,299.00" and "1.299,00")
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized = cleaned;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized =
      lastDot > lastComma
        ? cleaned.replace(/,/g, "")
        : cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    normalized =
      cleaned.length - lastComma === 4 ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Depth-first walk over a parsed JSON-LD tree, yielding every object. */
function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 12 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const entry of node) yield* walk(entry, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  yield obj;
  for (const value of Object.values(obj)) yield* walk(value, depth + 1);
}

function isProductLike(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (entry) =>
      typeof entry === "string" && ["Product", "Offer", "AggregateOffer"].includes(entry),
  );
}

/** Price from a JSON-LD tree: Offer.price, else AggregateOffer.lowPrice. */
export function priceFromJsonLd(parsed: unknown): number | null {
  for (const node of walk(parsed)) {
    if (!isProductLike(node)) continue;
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
    for (const offer of offers) {
      if (offer === null || typeof offer !== "object") continue;
      const candidate = offer as Record<string, unknown>;
      const price = parseAmount(candidate.price) ?? parseAmount(candidate.lowPrice);
      if (price !== null) return price;
    }
    // the node itself may be the Offer
    const own = parseAmount(node.price) ?? parseAmount(node.lowPrice);
    if (own !== null) return own;
  }
  return null;
}

/** Price from <meta property="product:price:amount" content="…"> style tags. */
export function priceFromMeta(html: string): number | null {
  const wanted = new Set([
    "product:price:amount",
    "og:price:amount",
    "price",
    "twitter:price",
  ]);
  for (const match of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    ATTR.lastIndex = 0;
    for (const attr of match.matchAll(ATTR)) {
      attrs.set((attr[1] ?? "").toLowerCase(), attr[2] ?? "");
    }
    const key = (attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop") ?? "")
      .toLowerCase();
    if (!wanted.has(key)) continue;
    const price = parseAmount(attrs.get("content"));
    if (price !== null) return price;
  }
  return null;
}

/**
 * One live price fetch. Fails closed: a blocked request, an unparsable
 * page, or a number that doesn't look like the current price all come back
 * as `{ok: false}` so the caller keeps the last known price instead.
 */
export async function fetchLivePrice(
  url: string,
  currentPrice: number,
): Promise<PriceFetch> {
  if (!isPublicHttpUrl(url)) return { ok: false, error: "url is not fetchable" };

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return { ok: false, error: `http ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.includes("html")) {
      return { ok: false, error: `unexpected content-type ${type.split(";")[0]}` };
    }
    // cap the read — a product page is a few hundred KB, a dump is not
    html = (await res.text()).slice(0, 2_000_000);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 160) : "fetch failed",
    };
  }

  let price: number | null = null;
  LD_JSON.lastIndex = 0;
  for (const block of html.matchAll(LD_JSON)) {
    try {
      price = priceFromJsonLd(JSON.parse((block[1] ?? "").trim()));
    } catch {
      continue; // one malformed ld+json block shouldn't sink the page
    }
    if (price !== null) break;
  }
  price ??= priceFromMeta(html);

  if (price === null) return { ok: false, error: "no price found in page" };
  if (price < 0.01 || price > 1_000_000) {
    return { ok: false, error: `implausible price ${price}` };
  }
  if (
    currentPrice > 0 &&
    Math.abs(price - currentPrice) / currentPrice > MAX_MOVE
  ) {
    return {
      ok: false,
      error: `price moved ${Math.round(((price - currentPrice) / currentPrice) * 100)}% — treating as a parse error`,
    };
  }
  return { ok: true, price };
}
