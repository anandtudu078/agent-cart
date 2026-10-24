import { Router } from "express";
import paypal from "@paypal/checkout-server-sdk";
import type { core as paypalCore } from "@paypal/checkout-server-sdk";
import { env } from "../config/env.js";
import {
  ActivityEvent,
  CartEntry,
  HistoryEntry,
  WatchItem,
} from "../models/index.js";
import { isOwnedBy, ownedByUser } from "../middleware/auth.js";
import { couponDiscount, findCoupon, listCoupons } from "../coupons.js";

// default import (not named): Node's CJS/ESM interop can't see the nested
// `orders` export of this untyped package
const { core, orders } = paypal;

export const cartRouter = Router();

interface PayPalOrderResult {
  id: string;
  status: string;
  links?: Array<{ rel: string; href: string }>;
}

/** null until PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are configured. */
function paypalClient(): paypalCore.PayPalHttpClient | null {
  const { clientId, clientSecret, mode } = env.paypal;
  if (!clientId || !clientSecret) return null;
  const environment =
    mode === "live"
      ? new core.LiveEnvironment(clientId, clientSecret)
      : new core.SandboxEnvironment(clientId, clientSecret);
  return new core.PayPalHttpClient(environment);
}

async function log(
  level: "info" | "ok" | "warn" | "buy",
  message: string,
): Promise<void> {
  await ActivityEvent.create({ level, message, source: "cart" });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** What the buyer actually pays for a reserved entry (price − coupon). */
function entryTotal(entry: { price: number; couponDiscount?: number | null }): number {
  return round2(entry.price - (entry.couponDiscount ?? 0));
}

/** GET /api/coupons — codes the agent knows, optionally for one retailer. */
cartRouter.get("/coupons", (req, res) => {
  const retailer = req.query.retailer;
  if (retailer !== undefined && typeof retailer !== "string") {
    res.status(400).json({ error: "retailer must be a single string value" });
    return;
  }
  res.json({ coupons: listCoupons(retailer) });
});

/** GET /api/cart — reserved items + subtotal, discount, total. */
cartRouter.get("/cart", async (req, res) => {
  const entries = await CartEntry.find({
    status: "reserved",
    ...ownedByUser(req.userId!),
  })
    .sort({ createdAt: -1 })
    .lean();
  const subtotal = entries.reduce((sum, entry) => sum + entry.price, 0);
  const discount = entries.reduce(
    (sum, entry) => sum + (entry.couponDiscount ?? 0),
    0,
  );
  res.json({
    entries,
    subtotal: round2(subtotal),
    discount: round2(discount),
    total: round2(subtotal - discount),
  });
});

/** POST /api/cart/:id/coupon — apply `{code}` to a reserved entry. */
cartRouter.post("/cart/:id/coupon", async (req, res) => {
  const body = (req.body ?? {}) as { code?: string };
  if (typeof body.code !== "string" || !body.code.trim()) {
    res.status(400).json({ error: "code is required" });
    return;
  }
  const entry = await CartEntry.findById(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "cart entry not found" });
    return;
  }
  if (!isOwnedBy(entry, req.userId!)) {
    res.status(403).json({ error: "not your cart entry" });
    return;
  }
  if (entry.status !== "reserved") {
    res.status(409).json({ error: "entry is no longer reserved" });
    return;
  }

  const coupon = findCoupon(body.code, entry.retailer);
  if (!coupon) {
    res.status(404).json({
      error: `“${body.code.trim()}” is not a valid code for ${entry.retailer}`,
    });
    return;
  }

  const discount = couponDiscount(coupon, entry.price);
  entry.couponCode = coupon.code;
  entry.couponDiscount = discount;
  await entry.save();
  await HistoryEntry.create({
    item: entry.watchItem,
    itemTitle: entry.itemTitle,
    action: "Coupon applied",
    detail: `${coupon.code} saved $${discount.toFixed(2)} at ${entry.retailer} ($${entry.price.toFixed(2)} → $${(entry.price - discount).toFixed(2)})`,
    kind: "buy",
  });
  await log(
    "ok",
    `coupon applied: ${coupon.code} on ${entry.itemTitle} — $${discount.toFixed(2)} off at ${entry.retailer}`,
  );
  res.json({ entry, discount });
});

/** DELETE /api/cart/:id/coupon — drop the applied code. */
cartRouter.delete("/cart/:id/coupon", async (req, res) => {
  const entry = await CartEntry.findById(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "cart entry not found" });
    return;
  }
  if (!isOwnedBy(entry, req.userId!)) {
    res.status(403).json({ error: "not your cart entry" });
    return;
  }
  if (!entry.couponCode) {
    res.status(409).json({ error: "no coupon on this entry" });
    return;
  }

  await log(
    "info",
    `coupon removed: ${entry.couponCode} on ${entry.itemTitle}`,
  );
  entry.couponCode = undefined;
  entry.couponDiscount = 0;
  await entry.save();
  res.json({ entry });
});

/** POST /api/cart — reserve a watch item in the cart. */
cartRouter.post("/cart", async (req, res) => {
  const body = (req.body ?? {}) as { watchItemId?: string };
  if (!body.watchItemId) {
    res.status(400).json({ error: "watchItemId is required" });
    return;
  }

  const item = await WatchItem.findById(body.watchItemId);
  if (!item) {
    res.status(404).json({ error: "watch item not found" });
    return;
  }
  if (!isOwnedBy(item, req.userId!)) {
    res.status(403).json({ error: "not your item" });
    return;
  }
  const existing = await CartEntry.findOne({
    watchItem: item._id,
    status: "reserved",
  });
  if (existing) {
    res.status(409).json({ error: "item is already in the cart" });
    return;
  }

  const entry = await CartEntry.create({
    watchItem: item._id,
    itemTitle: item.title,
    retailer: item.retailer,
    emoji: item.emoji,
    price: item.price,
    currency: item.currency,
    owner: req.userId,
  });
  await HistoryEntry.create({
    item: item._id,
    itemTitle: item.title,
    action: "Cart held",
    detail: `Reserved at $${item.price.toFixed(2)} from ${item.retailer} before checkout`,
    kind: "buy",
  });
  await log(
    "buy",
    `cart held: ${item.title} — $${item.price.toFixed(2)} at ${item.retailer}`,
  );
  res.status(201).json({ entry });
});

/** DELETE /api/cart/:id — release a reserved item. */
cartRouter.delete("/cart/:id", async (req, res) => {
  const entry = await CartEntry.findById(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "cart entry not found" });
    return;
  }
  if (!isOwnedBy(entry, req.userId!)) {
    res.status(403).json({ error: "not your cart entry" });
    return;
  }
  await entry.deleteOne();
  await log("info", `cart released: ${entry.itemTitle}`);
  res.json({ ok: true });
});

/** POST /api/cart/:id/checkout — create a PayPal order for the entry. */
cartRouter.post("/cart/:id/checkout", async (req, res) => {
  const entry = await CartEntry.findById(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "cart entry not found" });
    return;
  }
  if (!isOwnedBy(entry, req.userId!)) {
    res.status(403).json({ error: "not your cart entry" });
    return;
  }
  if (entry.status !== "reserved") {
    res.status(409).json({ error: "entry is no longer reserved" });
    return;
  }

  const client = paypalClient();
  if (!client) {
    res.status(501).json({
      error:
        "PayPal is not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox by default)",
    });
    return;
  }

  try {
    const request = new orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: entry.currency,
            value: entryTotal(entry).toFixed(2),
          },
          description: entry.itemTitle,
        },
      ],
    });
    const response = await client.execute<PayPalOrderResult>(request);
    const approvalUrl = response.result.links?.find(
      (link) => link.rel === "approve",
    )?.href;

    entry.paypalOrderId = response.result.id;
    await entry.save();
    await HistoryEntry.create({
      item: entry.watchItem,
      itemTitle: entry.itemTitle,
    action: "Checkout started",
    detail: `PayPal order ${response.result.id} — $${entryTotal(entry).toFixed(2)} after coupon, awaiting buyer approval`,
      kind: "buy",
    });
    await log(
      "buy",
      `checkout started: ${entry.itemTitle} — PayPal order ${response.result.id}`,
    );
    res.json({
      orderId: response.result.id,
      status: response.result.status,
      approvalUrl,
    });
  } catch (err) {
    await log(
      "warn",
      `checkout failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(502).json({
      error: `PayPal order creation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

/** POST /api/cart/:id/capture — capture an approved PayPal order. */
cartRouter.post("/cart/:id/capture", async (req, res) => {
  const entry = await CartEntry.findById(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "cart entry not found" });
    return;
  }
  if (!isOwnedBy(entry, req.userId!)) {
    res.status(403).json({ error: "not your cart entry" });
    return;
  }
  if (!entry.paypalOrderId) {
    res.status(409).json({ error: "no PayPal order to capture — run checkout first" });
    return;
  }

  const client = paypalClient();
  if (!client) {
    res.status(501).json({ error: "PayPal is not configured" });
    return;
  }

  try {
    const request = new orders.OrdersCaptureRequest(entry.paypalOrderId);
    request.requestBody({});
    const response = await client.execute<{ id: string; status: string }>(
      request,
    );

    entry.status = "checked_out";
    await entry.save();
    await HistoryEntry.create({
      item: entry.watchItem,
      itemTitle: entry.itemTitle,
    action: "Order captured",
    detail: `PayPal capture ${response.result.status} — $${entryTotal(entry).toFixed(2)} at ${entry.retailer}${entry.couponCode ? ` with ${entry.couponCode}` : ""}`,
      kind: "buy",
    });
    await log(
      "ok",
      `order captured: ${entry.itemTitle} — $${entryTotal(entry).toFixed(2)} (${response.result.status})`,
    );
    res.json({ orderId: response.result.id, status: response.result.status });
  } catch (err) {
    await log(
      "warn",
      `capture failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(502).json({
      error: `PayPal capture failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});
