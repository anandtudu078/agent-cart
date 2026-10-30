import { ActivityEvent, User } from "../models/index.js";
import { isPublicHttpUrl } from "./url-guard.js";

/**
 * Out-of-app price-drop alerts: POST one JSON payload to the webhook the
 * user saved in settings. Fire-and-forget from the scan cycle — an alert
 * that can't be delivered must never fail the cycle that found the drop.
 *
 * The payload carries both `content` (Discord) and `text` (Slack) keys, so
 * the two common incoming-webhook shapes work without any config; everything
 * else is ignored by both.
 */
const TIMEOUT_MS = 5_000;

export interface DropAlert {
  itemId: string;
  title: string;
  retailer: string;
  emoji: string;
  url?: string;
  oldPrice: number;
  newPrice: number;
  targetPrice: number;
  currency: string;
  autoBuy: boolean;
  /** PayPal approval link when the order was pre-created at reserve time. */
  approvalUrl?: string;
}

function message(alert: DropAlert): string {
  const { emoji, title, retailer, oldPrice, newPrice, targetPrice } = alert;
  return (
    `${emoji} **${title}** hit target at ${retailer} — ` +
    `$${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)} (target $${targetPrice.toFixed(2)})` +
    (alert.autoBuy ? " · held in cart" : "") +
    // one tap from the alert to PayPal — only when an order exists
    (alert.approvalUrl ? `\napprove in one tap: ${alert.approvalUrl}` : "")
  );
}

/** The rendered alert line — exported so the payload is testable. */
export const dropAlertMessage = message;

/**
 * POST the alert to the owner's configured webhook. Returns false when the
 * user has no webhook or the delivery failed — callers only log it.
 */
export async function sendDropAlert(
  owner: unknown,
  alert: DropAlert,
): Promise<boolean> {
  try {
    if (!owner) return false; // ownerless demo rows have nobody to notify
    const user = await User.findById(owner).select("settings.webhookUrl").lean();
    const target = user?.settings?.webhookUrl;
    // re-check at send time: the settings route already validated it, but a
    // doc written before that check must not become an internal POST
    if (!target || !isPublicHttpUrl(target)) return false;

    const text = message(alert);
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: text, // Discord
        text, // Slack
        event: "price.drop",
        item: {
          id: alert.itemId,
          title: alert.title,
          retailer: alert.retailer,
          url: alert.url ?? null,
          currency: alert.currency,
        },
        prices: {
          from: alert.oldPrice,
          to: alert.newPrice,
          target: alert.targetPrice,
        },
        checkout: { approvalUrl: alert.approvalUrl ?? null },
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return true;
    await logWarn(`webhook alert rejected: http ${res.status}`);
    return false;
  } catch (err) {
    await logWarn(
      `webhook alert failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`,
    );
    return false;
  }
}

async function logWarn(message: string): Promise<void> {
  try {
    await ActivityEvent.create({
      level: "warn",
      message,
      source: "webhook",
    });
  } catch {
    // logging must never take down an alert delivery attempt
  }
}
