import { Schema, model, type InferSchemaType } from "mongoose";

const settingsSchema = new Schema(
  {
    currency: {
      type: String,
      enum: ["USD", "EUR", "GBP", "INR", "JPY"],
      default: "USD",
      uppercase: true,
    },
    // gates browser notifications for price drops (settings page)
    priceAlerts: { type: Boolean, default: true },
    // where the agent POSTs a price-drop alert — Discord/Slack incoming
    // webhook or any endpoint that takes JSON; empty = alerts stay in-app
    webhookUrl: { type: String, default: "", trim: true, maxlength: 2_000 },
    // where the agent EMAILS price drops + the daily digest (Resend);
    // empty = email alerts stay off
    alertEmail: { type: String, default: "", trim: true, maxlength: 320 },
    // auto-buy guardrails: USD/day budget (0 = unlimited) and a manual
    // confirmation gate the scan cycle checks before it reserves anything
    autoBuyDailyCap: { type: Number, default: 0, min: 0 },
    confirmBeforeBuy: { type: Boolean, default: false },
    // immediate webhook/email alerts are skipped inside this UTC window;
    // in-app activity and the daily digest are not affected. start === end
    // is treated as "no window" rather than a 24-hour blackout.
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: Number, default: 22, min: 0, max: 23 },
    quietHoursEnd: { type: Number, default: 7, min: 0, max: 23 },
  },
  { _id: false, versionKey: false },
);

export const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true, versionKey: false },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User = model("User", userSchema, "users");