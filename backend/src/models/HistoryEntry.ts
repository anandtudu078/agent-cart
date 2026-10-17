import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A past agent decision (price drop, cart hold, scan result, …)
 * shown in the dashboard's History feed.
 */
export const historyEntrySchema = new Schema(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: "WatchItem",
      required: false,
      index: true,
    },
    // denormalized so the feed renders without a populate()
    itemTitle: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    detail: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ["buy", "alert", "scan", "info"],
      required: true,
      index: true,
    },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  {
    versionKey: false,
  },
);

// `item` references WatchItem (optional by design).

historyEntrySchema.index({ occurredAt: -1 });

export type HistoryEntryDoc = InferSchemaType<typeof historyEntrySchema>;

export const HistoryEntry = model(
  "HistoryEntry",
  historyEntrySchema,
  "history_entries",
);