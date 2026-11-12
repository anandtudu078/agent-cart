import type { Types } from "mongoose";
import { ActivityEvent, User } from "../models/index.js";
import { isPublicHttpUrl } from "./url-guard.js";
import { inQuietHours } from "./quiet.js";

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
  /** "restock" changes the wording and the webhook event name. */
  kind?: "drop" | "restock";
  /** PayPal approval link when the order was pre-created at reserve time. */
  approvalUrl?: string;
}

function message(alert: DropAlert): string {
  const { emoji, title, retailer, oldPrice, newPrice, targetPrice } = alert;
  const head =
    alert.kind === "restock"
      ? `${emoji} **${title}** is back in stock at ${retailer} — ` +
        `$${newPrice.toFixed(2)} (target $${targetPrice.toFixed(2)})`
      : `${emoji} **${title}** hit target at ${retailer} — ` +
        `$${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)} (target $${targetPrice.toFixed(2)})`;
  return (
    head +
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
    const user = await User.findById(owner)
      .select(
        "settings.webhookUrl settings.quietHoursEnabled settings.quietHoursStart settings.quietHoursEnd",
      )
      .lean();
    const settings = user?.settings;
    const target = settings?.webhookUrl;
    // re-check at send time: the settings route already validated it, but a
    // doc written before that check must not become an internal POST
    if (!target || !isPublicHttpUrl(target)) return false;
    // quiet hours silence the out-of-app copy only; the drop still lands in
    // the in-app activity feed from the scan cycle
    if (
      inQuietHours(new Date(), {
        enabled: settings?.quietHoursEnabled ?? false,
        start: settings?.quietHoursStart ?? 22,
        end: settings?.quietHoursEnd ?? 7,
      })
    ) {
      return false;
    }

    const text = message(alert);
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: text, // Discord
        text, // Slack
        event: alert.kind === "restock" ? "stock.restock" : "price.drop",
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
    await logWarn(`webhook alert rejected: http ${res.status}`, owner);
    return false;
  } catch (err) {
    await logWarn(
      `webhook alert failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`,
      owner,
    );
    return false;
  }
}

// owner-scoped: without it the line is a system event every signed-in user
// sees, and a delivery error can name the target endpoint
async function logWarn(message: string, owner: unknown): Promise<void> {
  try {
    await ActivityEvent.create({
      level: "warn",
      message,
      source: "webhook",
      owner: owner as Types.ObjectId | null | undefined,
    });
  } catch {
    // logging must never take down an alert delivery attempt
  }
}
