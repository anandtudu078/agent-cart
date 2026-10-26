import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * One observed price for a watch item — the data behind the chart.
 * Written once per scan cycle per item, and only when a price was actually
 * observed (a failed fetch writes nothing, so the chart shows a gap instead
 * of a fabricated flat line).
 */
export const pricePointSchema = new Schema(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: "WatchItem",
      required: true,
    },
    price: { type: Number, required: true, min: 0 },
    at: { type: Date, required: true },
    // where this number came from: live scrape, Python agent, or local jitter
    source: {
      type: String,
      enum: ["live", "agent-service", "simulated"],
      default: "simulated",
    },
    // follows the watch item's owner so the series inherits its scoping
    owner: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { versionKey: false },
);

pricePointSchema.index({ item: 1, at: -1 });
// shortcut: 90 days of raw points — downsample to hourly before extending
// this if a chart ever needs a full year
pricePointSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export type PricePointDoc = InferSchemaType<typeof pricePointSchema>;

export const PricePoint = model("PricePoint", pricePointSchema, "price_points");
