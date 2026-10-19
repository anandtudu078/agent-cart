import { Schema, model, type InferSchemaType } from "mongoose";

const ACTIVITY_TTL_DAYS = 30;

/**
 * A single line of the agent's real-time activity log
 * ("agent.log — live tail" on the dashboard).
 */
export const activityEventSchema = new Schema(
  {
    level: {
      type: String,
      enum: ["info", "ok", "warn", "buy"],
      required: true,
      index: true,
    },
    message: { type: String, required: true, trim: true },
    source: { type: String, trim: true },
    // true on lines the UI should also surface as a desktop/toast alert
    alert: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

activityEventSchema.index({ createdAt: -1 });
// Auto-expire log lines after 30 days so the collection stays bounded.
activityEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ACTIVITY_TTL_DAYS * 24 * 60 * 60 },
);

export type ActivityEventDoc = InferSchemaType<typeof activityEventSchema>;

export const ActivityEvent = model(
  "ActivityEvent",
  activityEventSchema,
  "activity_events",
);