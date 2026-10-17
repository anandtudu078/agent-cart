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
    lastCheckedAt: { type: Date },
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