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
      // held = the guardrails stopped the auto-buy; the user approves it from
      // the cart's waiting-for-approval queue, which flips it to reserved
      type: String,
      enum: ["held", "reserved", "checked_out"],
      default: "reserved",
      index: true,
    },
    // why the guardrails held this one (confirm-before-buy / daily cap)
    holdReason: { type: String, maxlength: 300 },
    // when a held row stops being approvable — the TTL index below sweeps it.
    // Only held rows carry this field, so the TTL can never delete a reserved
    // or checked-out entry.
    holdExpiresAt: { type: Date },
    paypalOrderId: { type: String },
    // approval link from the order created at reserve time — the drop alert
    // carries it so the buyer can approve in one tap (fresh orders overwrite)
    paypalApprovalUrl: { type: String },
    // when the PayPal/Nano leg actually settled — the auto-buy cap counts
    // money at capture time, not when the item was reserved
    capturedAt: { type: Date },
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
// Mongo removes a held row once its 24h approval window closes (~60s sweep).
// The cart read and the approve route also check the deadline, so a lagging
// sweep can't resurface an expired price.
cartEntrySchema.index({ holdExpiresAt: 1 }, { expireAfterSeconds: 0 });

export type CartEntryDoc = InferSchemaType<typeof cartEntrySchema>;

export const CartEntry = model("CartEntry", cartEntrySchema, "cart_entries");
