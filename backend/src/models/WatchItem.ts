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
    // optional so seeded demo rows stay shared; null = visible to any signed-in user
    owner: { type: Schema.Types.ObjectId, ref: "User", index: true },
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