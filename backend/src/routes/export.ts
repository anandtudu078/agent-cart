import { Router, type Response } from "express";
import { ownedByUser } from "../middleware/auth.js";
import { PricePoint, WatchItem } from "../models/index.js";
import { toCsv } from "../csv.js";

/** CSV downloads for the dashboard's tables. */
export const exportRouter = Router();

function sendCsv(res: Response, filename: string, body: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
}

function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : "";
}

/** GET /api/export/watchlist — the signed-in user's watchlist as CSV. */
exportRouter.get("/export/watchlist", async (req, res) => {
  const items = await WatchItem.find(ownedByUser(req.userId!))
    .sort({ createdAt: -1 })
    .lean();
  const csv = toCsv(
    [
      "title",
      "retailer",
      "price",
      "target_price",
      "currency",
      "status",
      "auto_buy",
      "offers",
      "fetch_status",
      "in_stock",
      "url",
      "last_checked_at",
      "created_at",
    ],
    items.map((item) => [
      item.title,
      item.retailer,
      item.price,
      item.targetPrice,
      item.currency,
      item.status,
      item.autoBuy,
      item.offers.length,
      item.fetchStatus,
      item.inStock,
      item.url ?? "",
      iso(item.lastCheckedAt),
      iso((item as { createdAt?: Date }).createdAt),
    ]),
  );
  sendCsv(res, "agentcart-watchlist.csv", csv);
});

/** GET /api/export/prices — the newest retained price points, newest first. */
exportRouter.get("/export/prices", async (req, res) => {
  const items = await WatchItem.find(ownedByUser(req.userId!))
    .select("_id title")
    .lean();
  const titles = new Map(items.map((item) => [String(item._id), item.title]));
  // shortcut: newest 10k points — paginate when one export outgrows this
  const points = items.length
    ? await PricePoint.find({ item: { $in: items.map((item) => item._id) } })
        .sort({ at: -1 })
        .limit(10_000)
        .lean()
    : [];
  const csv = toCsv(
    ["item", "item_id", "observed_at", "price", "source"],
    points.map((point) => [
      titles.get(String(point.item)) ?? "",
      String(point.item),
      iso(point.at),
      point.price,
      point.source,
    ]),
  );
  sendCsv(res, "agentcart-price-history.csv", csv);
});
