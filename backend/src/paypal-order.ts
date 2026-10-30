import paypal from "@paypal/checkout-server-sdk";
import type { core as paypalCore } from "@paypal/checkout-server-sdk";
import { env } from "./config/env.js";
import { CartEntry, HistoryEntry } from "./models/index.js";

// default import (not named): Node's CJS/ESM interop can't see the nested
// `orders` export of this untyped package
const { core, orders } = paypal;

interface PayPalOrderResult {
  id: string;
  status: string;
  links?: Array<{ rel: string; href: string }>;
}

type CartEntryDoc = NonNullable<Awaited<ReturnType<typeof CartEntry.findOne>>>;

/** What the buyer actually pays for a reserved entry (price − coupon). */
export function entryTotal(entry: {
  price: number;
  couponDiscount?: number | null;
}): number {
  return round2(entry.price - (entry.couponDiscount ?? 0));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** null until PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are configured. */
export function paypalClient(): paypalCore.PayPalHttpClient | null {
  const { clientId, clientSecret, mode } = env.paypal;
  if (!clientId || !clientSecret) return null;
  const environment =
    mode === "live"
      ? new core.LiveEnvironment(clientId, clientSecret)
      : new core.SandboxEnvironment(clientId, clientSecret);
  return new paypal.core.PayPalHttpClient(environment);
}

/** Whether PayPal orders can be created at all (creds present). */
export function isPaypalConfigured(): boolean {
  return Boolean(env.paypal.clientId && env.paypal.clientSecret);
}

export type CreateOrderResult =
  | { ok: true; orderId: string; status: string; approvalUrl?: string }
  | { ok: false; reason: "not_configured" | "failed"; error: string };

/**
 * Create a PayPal order for a reserved entry and remember it on the entry
 * (`paypalOrderId` + `paypalApprovalUrl`), with the "Checkout started"
 * history line.
 *
 * Shared by `POST /api/cart/:id/checkout` (manual) and the scan cycle
 * (pre-created at auto-buy time, so the drop alert can carry the approval
 * link). Never throws: callers decide how to report a failure.
 *
 * shortcut: PayPal approval links expire (~1h) — a stale link 404s at
 * PayPal, so the manual checkout route stays the fallback that mints a
 * fresh one.
 */
export async function createEntryOrder(
  entry: CartEntryDoc,
): Promise<CreateOrderResult> {
  const client = paypalClient();
  if (!client) {
    return {
      ok: false,
      reason: "not_configured",
      error:
        "PayPal is not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox by default)",
    };
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
    entry.paypalApprovalUrl = approvalUrl;
    await entry.save();
    await HistoryEntry.create({
      item: entry.watchItem,
      itemTitle: entry.itemTitle,
      action: "Checkout started",
      detail: `PayPal order ${response.result.id} — $${entryTotal(entry).toFixed(2)} after coupon, awaiting buyer approval`,
      kind: "buy",
      owner: entry.owner,
    });
    return {
      ok: true,
      orderId: response.result.id,
      status: response.result.status,
      approvalUrl,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
