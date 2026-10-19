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