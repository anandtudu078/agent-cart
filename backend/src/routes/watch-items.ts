import { Router } from "express";
import mongoose from "mongoose";
import { WatchItem, PricePoint } from "../models/index.js";
import { isOwnedBy, ownedByUser } from "../middleware/auth.js";
import { resolveProduct } from "../agent/fetch-price.js";
import { isPublicHttpUrl } from "../agent/url-guard.js";
import { trendFor, INSUFFICIENT, type Trend } from "../agent/trend.js";
import { bestOffer } from "../agent/cycle.js";

export const watchItemsRouter = Router();

const STATUSES = ["watching", "drop", "paused"] as const;

// field caps — one place for every length rule, checked before anything is
// written (the body limit is 1MB; nothing legitimate needs more than this)
const MAX_TITLE = 500;
const MAX_RETAILER = 100;
const MAX_EMOJI = 16;

export interface WatchInput {
  title: string;
  retailer?: string;
  price?: number;
  targetPrice: number;
  emoji?: string;
  url?: string;
  pollIntervalSec?: number;
}

/**
 * Validate the create-watch-item body.
 *
 * Every field is type-checked before it is touched: a payload like
 * `{"title": {"$ne": ""}}` must come back as a 400, never as a thrown
 * `body.title.trim is not a function` (500). The product URL is also
 * checked as a public http(s) host here, so an internal address can't be
 * saved in the first place — the fetcher re-checks it on every request.
 */
export function parseWatchInput(
  body: unknown,
): { ok: true; value: WatchInput } | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (typeof raw.title !== "string" || !raw.title.trim()) {
    return { ok: false, error: "title is required" };
  }
  if (raw.title.trim().length > MAX_TITLE) {
    return { ok: false, error: `title must be at most ${MAX_TITLE} characters` };
  }

  if (
    typeof raw.targetPrice !== "number" ||
    !Number.isFinite(raw.targetPrice) ||
    raw.targetPrice < 0
  ) {
    return { ok: false, error: "targetPrice must be a non-negative number" };
  }

  if (raw.retailer !== undefined) {
    if (
      typeof raw.retailer !== "string" ||
      raw.retailer.trim().length > MAX_RETAILER
    ) {
      return {
        ok: false,
        error: `retailer must be a string of at most ${MAX_RETAILER} characters`,
      };
    }
  }

  if (raw.price !== undefined) {
    if (
      typeof raw.price !== "number" ||
      !Number.isFinite(raw.price) ||
      raw.price < 0
    ) {
      return { ok: false, error: "price must be a non-negative number" };
    }
  }

  let emoji: string | undefined;
  if (raw.emoji !== undefined && raw.emoji !== null) {
    if (typeof raw.emoji !== "string" || raw.emoji.length > MAX_EMOJI) {
      return {
        ok: false,
        error: `emoji must be a string of at most ${MAX_EMOJI} characters`,
      };
    }
    emoji = raw.emoji;
  }

  let url: string | undefined;
  if (raw.url !== undefined && raw.url !== null) {
    if (typeof raw.url !== "string") {
      return { ok: false, error: "url must be a string" };
    }
    const trimmed = raw.url.trim();
    if (trimmed && !isPublicHttpUrl(trimmed)) {
      return { ok: false, error: "url must be a public http(s) URL" };
    }
    url = trimmed || undefined;
  }

  let pollIntervalSec: number | undefined;
  if (raw.pollIntervalSec !== undefined && raw.pollIntervalSec !== null) {
    if (
      typeof raw.pollIntervalSec !== "number" ||
      !Number.isFinite(raw.pollIntervalSec)
    ) {
      return { ok: false, error: "pollIntervalSec must be a number" };
    }
    // same 5s..86400s window the PATCH route and the scheduler enforce
    pollIntervalSec = Math.min(86_400, Math.max(5, Math.trunc(raw.pollIntervalSec)));
  }

  return {
    ok: true,
    value: {
      title: raw.title.trim(),
      retailer: raw.retailer ? raw.retailer.trim() : undefined,
      price: typeof raw.price === "number" ? raw.price : undefined,
      targetPrice: raw.targetPrice,
      emoji,
      url,
      pollIntervalSec,
    },
  };
}

// points per item fed to the trend signal — 60 is plenty for the half-split
// and keeps the aggregation bounded no matter how long an item has run
const TREND_POINTS = 60;

/**
 * One aggregation over price_points → trend per item, so the watchlist gets
 * a buy-now-or-wait badge without an N+1 query per row.
 * `$topN` needs MongoDB 5.2+ (local mongo:7 / Atlas are both fine).
 */
async function trendByItem(
  ids: readonly unknown[],
): Promise<Map<string, Trend>> {
  const map = new Map<string, Trend>();
  if (ids.length === 0) return map;

  const rows = await PricePoint.aggregate<{ _id: unknown; prices: number[] }>([
    { $match: { item: { $in: ids } } },
    {
      $group: {
        _id: "$item",
        // newest first from $topN; trendFor wants oldest first
        prices: {
          $topN: { n: TREND_POINTS, output: "$price", sortBy: { at: -1 } },
        },
      },
    },
  ]);
  for (const row of rows) map.set(String(row._id), trendFor(row.prices.reverse()));
  return map;
}

/** GET /api/watch-items — full watchlist, newest first. Each item carries a
 * `trend` verdict (`rising | falling | flat | insufficient`) from its own
 * price history. */
// one product, at most this many retailers — enough to compare while keeping
// a single scan cycle cheap (shortcut: raise alongside a fetch pool)
const MAX_OFFERS = 5;

interface OfferInput {
  retailer: string;
  url?: string;
  price: number;
}

/**
 * Validate the `offers` array of POST/PATCH /api/watch-items.
 * Returns `{ offers }` on success, `{ error }` on a bad payload, and
 * `{ offers: undefined }` when the client sent no offers at all.
 */
function parseOffers(raw: unknown): { offers?: OfferInput[]; error?: string } {
  if (raw === undefined || raw === null) return { offers: undefined };
  if (!Array.isArray(raw)) return { error: "offers must be an array" };
  if (raw.length === 0) return { error: "offers must not be empty" };
  if (raw.length > MAX_OFFERS) {
    return { error: `offers must have at most ${MAX_OFFERS} retailers` };
  }

  const offers: OfferInput[] = [];
  for (const rawOffer of raw as Record<string, unknown>[]) {
    const retailer =
      typeof rawOffer?.retailer === "string" ? rawOffer.retailer.trim() : "";
    const price = rawOffer?.price;
    const url = typeof rawOffer?.url === "string" ? rawOffer.url.trim() : "";
    if (!retailer) return { error: "every offer needs a retailer" };
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return { error: `price for ${retailer} must be a number` };
    }
    offers.push({ retailer, price, url: url || undefined });
  }
  return { offers };
}

/** GET /api/watch-items — full watchlist, newest first. */
watchItemsRouter.get("/watch-items", async (req, res) => {
  const items = await WatchItem.find(ownedByUser(req.userId!))
    .sort({ createdAt: -1 })
    .lean();
  const trends = await trendByItem(items.map((item) => item._id));
  res.json({
    items: items.map((item) => ({
      ...item,
      trend: trends.get(String(item._id)) ?? INSUFFICIENT,
    })),
  });
});

/**
 * POST /api/watch-items/resolve — read title/price/retailer off a product
 * page so the add form can be filled from a pasted URL. No row is written.
 */
watchItemsRouter.post("/watch-items/resolve", async (req, res) => {
  const body = (req.body ?? {}) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const result = await resolveProduct(url);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  // nothing found is still a valid answer — the form keeps what the user typed
  if (!result.meta.title && result.meta.price === null) {
    res.status(422).json({ error: "no product title or price found in that page" });
    return;
  }
  res.json({ url, ...result.meta });
});

/** GET /api/watch-items/:id/series — price points for the chart, oldest first.
 * Query: ?limit=1..500 (newest N, returned in chronological order)
 */
watchItemsRouter.get("/watch-items/:id/series", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const item = await WatchItem.findById(req.params.id);
  if (!item) {
    res.status(404).json({ error: "watch item not found" });
    return;
  }
  if (!isOwnedBy(item, req.userId!)) {
    res.status(403).json({ error: "not your item" });
    return;
  }

  const rawLimit = Number(req.query.limit);
  // reject operator payloads like ?limit[$ne]=x instead of ignoring them
  if (req.query.limit !== undefined && !Number.isFinite(rawLimit)) {
    res.status(400).json({ error: "limit must be a number" });
    return;
  }
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500)
    : 300;

  // newest N first, then flipped so the chart reads left-to-right in time
  const rows = await PricePoint.find({ item: item._id })
    .sort({ at: -1 })
    .limit(limit)
    .lean();
  rows.reverse();
  res.json({
    points: rows.map((row) => ({
      at: row.at.toISOString(),
      price: row.price,
      source: row.source,
    })),
  });
});

/** POST /api/watch-items — start watching a product. */
watchItemsRouter.post("/watch-items", async (req, res) => {
  const parsed = parseWatchInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { offers, error } = parseOffers((req.body ?? {}).offers);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  // with offers the headline mirrors the cheapest one, so the client only has
  // to send a retailer/price when it is a single-retailer row
  const value = parsed.value;
  const winner = offers ? bestOffer(offers) : null;
  const retailer = winner ? winner.retailer : value.retailer;
  const price = winner ? winner.price : value.price;
  if (!retailer) {
    res.status(400).json({ error: "retailer is required" });
    return;
  }
  if (typeof price !== "number") {
    res.status(400).json({ error: "price must be a number" });
    return;
  }

  const item = await WatchItem.create({
    title: value.title,
    retailer,
    price,
    targetPrice: value.targetPrice,
    emoji: value.emoji,
    url: winner?.url ?? value.url,
    pollIntervalSec: value.pollIntervalSec,
    offers,
    owner: req.userId,
  });
  res.status(201).json({ item });
});

/** PATCH /api/watch-items/:id — update price, target, status, or autoBuy. */
watchItemsRouter.patch("/watch-items/:id", async (req, res) => {
  const body = (req.body ?? {}) as {
    price?: number;
    targetPrice?: number;
    status?: string;
    deltaPct?: number;
    autoBuy?: boolean;
    pollIntervalSec?: number;
    offers?: unknown;
  };

  const { offers, error } = parseOffers(body.offers);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  if (body.status && !STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
    return;
  }
  // a known field carrying the wrong type is a bad request, not a silent
  // no-op — {"price": {"$ne": 1}} must not answer 200 as if it landed
  for (const key of ["price", "targetPrice", "deltaPct"] as const) {
    const val = body[key];
    if (val !== undefined && typeof val !== "number") {
      res.status(400).json({ error: `${key} must be a number` });
      return;
    }
  }
  if (body.autoBuy !== undefined && typeof body.autoBuy !== "boolean") {
    res.status(400).json({ error: "autoBuy must be a boolean" });
    return;
  }
  if (body.pollIntervalSec !== undefined) {
    if (
      typeof body.pollIntervalSec !== "number" ||
      !Number.isFinite(body.pollIntervalSec)
    ) {
      res.status(400).json({ error: "pollIntervalSec must be a number" });
      return;
    }
    // clamp to the same 5s..86400s window the agent scheduler enforces
    body.pollIntervalSec = Math.min(
      86_400,
      Math.max(5, Math.trunc(body.pollIntervalSec)),
    );
  }

  const item = await WatchItem.findById(req.params.id);
  if (!item) {
    res.status(404).json({ error: "watch item not found" });
    return;
  }
  if (!isOwnedBy(item, req.userId!)) {
    res.status(403).json({ error: "not your item" });
    return;
  }

  if (typeof body.price === "number") item.price = body.price;
  if (typeof body.targetPrice === "number") item.targetPrice = body.targetPrice;
  if (typeof body.deltaPct === "number") item.deltaPct = body.deltaPct;
  if (body.status) item.status = body.status as (typeof STATUSES)[number];
  if (body.autoBuy !== undefined) item.autoBuy = body.autoBuy;
  if (typeof body.pollIntervalSec === "number") item.pollIntervalSec = body.pollIntervalSec;
  if (offers) {
    // replacing the offers re-picks the headline the same way POST does
    const winner = bestOffer(offers);
    item.offers = offers as typeof item.offers;
    if (winner) {
      item.retailer = winner.retailer;
      item.price = winner.price;
      if (winner.url) item.url = winner.url;
    }
  }
  item.lastCheckedAt = new Date();
  await item.save();
  res.json({ item });
});

/** DELETE /api/watch-items/:id — stop watching. */
watchItemsRouter.delete("/watch-items/:id", async (req, res) => {
  const item = await WatchItem.findById(req.params.id);
  if (!item) {
    res.status(404).json({ error: "watch item not found" });
    return;
  }
  if (!isOwnedBy(item, req.userId!)) {
    res.status(403).json({ error: "not your item" });
    return;
  }
  await item.deleteOne();
  // drop the chart data with it — otherwise points linger until the TTL
  await PricePoint.deleteMany({ item: item._id });
  res.json({ ok: true });
});
