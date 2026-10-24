import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A watch item the agent has pulled into the cart, awaiting (or holding)
 * a PayPal checkout.
 */
export const cartEntrySchema = new Schema(
  {
    watchItem: {
      type: Schema.Types.ObjectId,
      ref: "WatchItem",
      required: true,
      index: true,
    },
    // denormalized so the cart renders without a populate()
    itemTitle: { type: String, required: true, trim: true },
    retailer: { type: String, required: true, trim: true },
    emoji: { type: String, default: "🛍️" },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD", uppercase: true },
    status: {
      type: String,
      enum: ["reserved", "checked_out"],
      default: "reserved",
      index: true,
    },
    paypalOrderId: { type: String },
    // coupon applied at checkout — discount frozen at apply time (prices are
    // frozen when the item is reserved)
    couponCode: { type: String, trim: true, uppercase: true },
    couponDiscount: { type: Number, default: 0, min: 0 },
    // optional so seeded demo rows stay shared; null = visible to any signed-in user
    owner: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

cartEntrySchema.index({ createdAt: -1 });

export type CartEntryDoc = InferSchemaType<typeof cartEntrySchema>;

export const CartEntry = model("CartEntry", cartEntrySchema, "cart_entries");
