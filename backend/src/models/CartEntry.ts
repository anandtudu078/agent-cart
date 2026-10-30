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
    // approval link from the order created at reserve time — the drop alert
    // carries it so the buyer can approve in one tap (fresh orders overwrite)
    paypalApprovalUrl: { type: String },
    // Nano settle leg — the quote is frozen when requested and the entry only
    // flips to checked_out once verifySendBlock() confirms a settled send.
    // raw amounts are uint128 decimal strings: BSON has no bigint.
    nanoQuotedXno: { type: String },
    nanoAmountRaw: { type: String },
    nanoRate: { type: Number },
    nanoQuoteExpiresAt: { type: Date },
    nanoBlockHash: { type: String },
    // denormalized from NANO_ADDRESS at quote time so the cart can render the
    // payment panel without asking the API for config again
    nanoAddress: { type: String },
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
