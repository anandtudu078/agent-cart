import { Router } from "express";
import { WatchItem } from "../models/index.js";
import { isOwnedBy, ownedByUser } from "../middleware/auth.js";

export const watchItemsRouter = Router();

const STATUSES = ["watching", "drop", "paused"] as const;

/** GET /api/watch-items — full watchlist, newest first. */
watchItemsRouter.get("/watch-items", async (req, res) => {
  const items = await WatchItem.find(ownedByUser(req.userId!))
    .sort({ createdAt: -1 })
    .lean();
  res.json({ items });
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

/** PATCH /api/watch-items/:id — update price, target, or status. */
watchItemsRouter.patch("/watch-items/:id", async (req, res) => {
  const body = (req.body ?? {}) as {
    price?: number;
    targetPrice?: number;
    status?: string;
    deltaPct?: number;
  };

  if (body.status && !STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
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

  if (typeof body.price === "number") item.price = body.price;
  if (typeof body.targetPrice === "number") item.targetPrice = body.targetPrice;
  if (typeof body.deltaPct === "number") item.deltaPct = body.deltaPct;
  if (body.status) item.status = body.status as (typeof STATUSES)[number];
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
  res.json({ ok: true });
});
