import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A product the agent is watching for price changes.
 */
export const watchItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    retailer: { type: String, required: true, trim: true },
    emoji: { type: String, default: "🛍️" },
    image: { type: String },
    price: { type: Number, required: true, min: 0 },
    targetPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD", uppercase: true },
    deltaPct: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["watching", "drop", "paused"],
      default: "watching",
      index: true,
    },
    pollIntervalSec: { type: Number, default: 30, min: 5 },
    // other retailers selling the same product. Each offer is polled on its
    // own url and the headline `retailer` / `price` / `url` always mirror the
    // cheapest one, so the chart, cart and webhook need no new code.
    // empty (or absent) = the classic single-retailer row.
    offers: {
      // default keeps rows written before this field existed reading as []
      default: [],
      type: [
        {
          retailer: { type: String, required: true, trim: true },
          url: { type: String, trim: true },
          price: { type: Number, required: true, min: 0 },
          fetchStatus: {
            type: String,
            enum: ["ok", "stale", "error", "simulated"],
            default: "simulated",
          },
          lastFetchError: { type: String, maxlength: 200 },
          fetchedAt: { type: Date },
        },
      ],
    },
    // when a scan drops price to target, pull it into the cart automatically
    autoBuy: { type: Boolean, default: false, index: true },
    lastCheckedAt: { type: Date },
    // outcome of the last live fetch of `url`:
    //   ok        — fetched this cycle, price is real
    //   stale     — fetch failed, price still the last real one
    //   error     — fetch failed and no real price has ever been read
    //   simulated — no url configured; price comes from the agent/jitter
    fetchStatus: {
      type: String,
      enum: ["ok", "stale", "error", "simulated"],
      default: "simulated",
      index: true,
    },
    lastFetchError: { type: String, maxlength: 200 },
    fetchedAt: { type: Date },
    // last live verdict on availability: false = the page reported it sold
    // out. Stays as-is on a failed fetch (we learned nothing), so `true`
    // means "last time we could tell, it was buyable" — not a guarantee.
    inStock: { type: Boolean, default: true },
    // optional so seeded demo rows stay shared; null = visible to any signed-in user
    owner: { type: Schema.Types.ObjectId, ref: "User", index: true },
    // trend verdict from price history (calculated from HistoryEntry data)
    trend: {
      type: {
        verdict: {
          type: String,
          enum: ["rising", "falling", "flat", "insufficient"],
        },
        changePct: { type: Number },
      },
      default: () => ({ verdict: "insufficient", changePct: 0 }),
    },
    // observed price range low/high/points from history
    range: {
      type: {
        low: { type: Number, default: 0 },
        high: { type: Number, default: 0 },
        points: { type: Number, default: 0 },
        aboveLowPct: { type: Number, default: 0 },
      },
      default: () => ({ low: 0, high: 0, points: 0, aboveLowPct: 0 }),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Sidebar feed reads newest-first.
watchItemSchema.index({ createdAt: -1 });

export type WatchItemDoc = InferSchemaType<typeof watchItemSchema>;

export const WatchItem = model("WatchItem", watchItemSchema, "watch_items");