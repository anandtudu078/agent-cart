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

/** GET /api/cart — reserved items + total value. */
cartRouter.get("/cart", async (_req, res) => {
  const entries = await CartEntry.find({ status: "reserved" })
    .sort({ createdAt: -1 })
    .lean();
  const total = entries.reduce((sum, entry) => sum + entry.price, 0);
  res.json({ entries, total });
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
  const entry = await CartEntry.findByIdAndDelete(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "cart entry not found" });
    return;
  }
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
            value: entry.price.toFixed(2),
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
      detail: `PayPal order ${response.result.id} — awaiting buyer approval`,
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
      detail: `PayPal capture ${response.result.status} — $${entry.price.toFixed(2)} at ${entry.retailer}`,
      kind: "buy",
    });
    await log(
      "ok",
      `order captured: ${entry.itemTitle} — $${entry.price.toFixed(2)} (${response.result.status})`,
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
