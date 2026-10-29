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
  | {
      ok: true;
      price: number;
      /** true = buyable, false = sold out, null = page declared nothing. */
      inStock: boolean | null;
    }
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

/** schema.org availability value → buyable?, or null when unrecognized. */
function stockFromValue(raw: unknown): boolean | null {
  if (typeof raw !== "string") return null;
  const value = raw
    .toLowerCase()
    .replace(/^https?:\/\/schema\.org\//, "")
    .replace(/[^a-z]/g, "");
  if (["outofstock", "soldout", "discontinued"].includes(value)) return false;
  if (
    [
      "instock",
      "preorder",
      "presale",
      "limitedavailability",
      "onlineonly",
      "instoreonly",
    ].includes(value)
  ) {
    return true;
  }
  return null;
}

/**
 * Availability from a JSON-LD tree: Offer.availability, else the node's own.
 * Structured data only — same reason as the price: "sold out" in one block
 * of page copy says nothing about the buy button in another.
 */
export function stockFromJsonLd(parsed: unknown): boolean | null {
  for (const node of walk(parsed)) {
    if (!isProductLike(node)) continue;
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
    for (const offer of offers) {
      if (offer === null || typeof offer !== "object") continue;
      const verdict = stockFromValue(
        (offer as Record<string, unknown>).availability,
      );
      if (verdict !== null) return verdict;
    }
    // the node itself may be the Offer
    const own = stockFromValue(node.availability);
    if (own !== null) return own;
  }
  return null;
}

/**
 * Availability from meta/link tags: `<meta property="product:availability"
 * content="…">` and `<link itemprop="availability" href="…">`.
 */
export function stockFromMeta(html: string): boolean | null {
  const wanted = new Set(["availability", "og:availability", "product:availability"]);
  for (const match of html.match(/<(?:meta|link)\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    ATTR.lastIndex = 0;
    for (const attr of match.matchAll(ATTR)) {
      attrs.set((attr[1] ?? "").toLowerCase(), attr[2] ?? "");
    }
    const key = (attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop") ?? "")
      .toLowerCase();
    if (!wanted.has(key)) continue;
    const verdict = stockFromValue(attrs.get("content") ?? attrs.get("href"));
    if (verdict !== null) return verdict;
  }
  return null;
}

/**
 * One live price fetch. Fails closed: a blocked request, an unparsable
 * page, or a number that doesn't look like the current price all come back
 * as `{ok: false}` so the caller keeps the last known price instead.
 */
type PageFetch = { ok: true; html: string } | { ok: false; error: string };

/** GET a page once — shared by the price fetch and the add-by-URL resolver. */
async function fetchPage(url: string): Promise<PageFetch> {
  if (!isPublicHttpUrl(url)) return { ok: false, error: "url is not fetchable" };

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
    return { ok: true, html: (await res.text()).slice(0, 2_000_000) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 160) : "fetch failed",
    };
  }
}

export async function fetchLivePrice(
  url: string,
  currentPrice: number,
): Promise<PriceFetch> {
  const page = await fetchPage(url);
  if (!page.ok) return page;
  const html = page.html;

  let price: number | null = null;
  let inStock: boolean | null = null;
  LD_JSON.lastIndex = 0;
  for (const block of html.matchAll(LD_JSON)) {
    try {
      const parsed = JSON.parse((block[1] ?? "").trim());
      price ??= priceFromJsonLd(parsed);
      inStock ??= stockFromJsonLd(parsed);
    } catch {
      continue; // one malformed ld+json block shouldn't sink the page
    }
    if (price !== null && inStock !== null) break;
  }
  price ??= priceFromMeta(html);
  inStock ??= stockFromMeta(html);

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
  return { ok: true, price, inStock };
}

/** What we could read off a product page, for the add-by-URL form. */
export interface ProductMeta {
  title: string | null;
  price: number | null;
  retailer: string;
}

/** Product name from a JSON-LD tree (Product.name), else null. */
export function titleFromJsonLd(parsed: unknown): string | null {
  for (const node of walk(parsed)) {
    if (!isProductLike(node)) continue;
    const name = node.name;
    if (typeof name === "string" && name.trim()) {
      return name.trim().slice(0, 200);
    }
  }
  return null;
}

/** Product title from og:title / twitter:title, else the bare <title>. */
export function titleFromMeta(html: string): string | null {
  const wanted = new Set(["og:title", "twitter:title"]);
  for (const match of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    ATTR.lastIndex = 0;
    for (const attr of match.matchAll(ATTR)) {
      attrs.set((attr[1] ?? "").toLowerCase(), attr[2] ?? "");
    }
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
    if (!wanted.has(key)) continue;
    const title = (attrs.get("content") ?? "").trim();
    if (title) return title.slice(0, 200);
  }
  const tag = /<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html);
  const text = (tag?.[1] ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 200) : null;
}

// shortcut: a handful of domains the demo targets — everything else falls
// back to the hostname's first label
const RETAILERS: Record<string, string> = {
  "amazon.com": "Amazon",
  "amazon.in": "Amazon",
  "amzn.in": "Amazon",
  "bestbuy.com": "Best Buy",
  "walmart.com": "Walmart",
  "target.com": "Target",
  "newegg.com": "Newegg",
  "ebay.com": "eBay",
  "etsy.com": "Etsy",
  "aliexpress.com": "AliExpress",
  "flipkart.com": "Flipkart",
  "keychron.com": "Keychron",
};

/** Retailer name guessed from the URL host ("www.bestbuy.com" → Best Buy). */
export function retailerFromUrl(raw: string): string {
  let host = "";
  try {
    host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
  for (const [domain, name] of Object.entries(RETAILERS)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  const label = host.split(".")[0] ?? host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Read title/price/retailer off a product page — what the "fetch from URL"
 * button fills into the add-watch form. A page that yields only some of the
 * three still succeeds; the user fills in the rest.
 */
export async function resolveProduct(
  url: string,
): Promise<{ ok: true; meta: ProductMeta } | { ok: false; error: string }> {
  const page = await fetchPage(url);
  if (!page.ok) return page;
  const html = page.html;

  let title: string | null = null;
  let price: number | null = null;
  LD_JSON.lastIndex = 0;
  for (const block of html.matchAll(LD_JSON)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse((block[1] ?? "").trim());
    } catch {
      continue;
    }
    title ??= titleFromJsonLd(parsed);
    price ??= priceFromJsonLd(parsed);
    if (title !== null && price !== null) break;
  }
  title ??= titleFromMeta(html);
  price ??= priceFromMeta(html);

  if (price !== null && (price < 0.01 || price > 1_000_000)) price = null;
  return { ok: true, meta: { title, price, retailer: retailerFromUrl(url) } };
}
