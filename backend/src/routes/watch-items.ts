import { Router } from "express";
import mongoose from "mongoose";
import { WatchItem, PricePoint } from "../models/index.js";
import { isOwnedBy, ownedByUser } from "../middleware/auth.js";
import { resolveProduct } from "../agent/fetch-price.js";
import { trendFor, INSUFFICIENT, type Trend } from "../agent/trend.js";

export const watchItemsRouter = Router();

const STATUSES = ["watching", "drop", "paused"] as const;

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
  const body = (req.body ?? {}) as {
    title?: string;
    retailer?: string;
    price?: number;
    targetPrice?: number;
    emoji?: string;
    url?: string;
    pollIntervalSec?: number;
  };

  if (!body.title?.trim() || !body.retailer?.trim()) {
    res.status(400).json({ error: "title and retailer are required" });
    return;
  }
  if (typeof body.price !== "number" || typeof body.targetPrice !== "number") {
    res.status(400).json({ error: "price and targetPrice must be numbers" });
    return;
  }

  const item = await WatchItem.create({
    title: body.title.trim(),
    retailer: body.retailer.trim(),
    price: body.price,
    targetPrice: body.targetPrice,
    emoji: body.emoji,
    url: body.url,
    pollIntervalSec: body.pollIntervalSec,
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
  };

  if (body.status && !STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
    return;
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
