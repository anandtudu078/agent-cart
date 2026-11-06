import type { Types } from "mongoose";
import { ActivityEvent, User } from "../models/index.js";
import { env } from "../config/env.js";
import type { DropAlert } from "./webhook.js";

/**
 * Out-of-app price-drop and restock alerts over email, via the Resend API.
 *
 * Same contract as webhook.ts: fire-and-forget from the scan cycle, an
 * undeliverable email must never fail the cycle that found the drop. The
 * whole feature is off until RESEND_API_KEY is set — the app is usable with
 * zero email credentials, exactly like the PayPal and Nano legs.
 *
 * shortcut: one provider (Resend), plain-text bodies, no retries — add a
 * queue with backoff when drops start getting lost in production.
 */
const TIMEOUT_MS = 5_000;

export function emailEnabled(): boolean {
  return Boolean(env.email.apiKey.trim());
}

/** Render one drop as a plain-text email — exported so the body is testable. */
export function dropEmailBody(alert: DropAlert): string {
  const restock = alert.kind === "restock";
  const lines = [
    restock
      ? `${alert.emoji} ${alert.title} is back in stock at ${alert.retailer}.`
      : `${alert.emoji} ${alert.title} hit your target price at ${alert.retailer}.`,
    "",
    restock
      ? `Price: $${alert.newPrice.toFixed(2)} (target $${alert.targetPrice.toFixed(2)})`
      : `Price: $${alert.oldPrice.toFixed(2)} → $${alert.newPrice.toFixed(2)} (target $${alert.targetPrice.toFixed(2)})`,
  ];
  if (alert.autoBuy) lines.push("The agent held it in your cart.");
  if (alert.approvalUrl) lines.push("", `Approve checkout in one tap: ${alert.approvalUrl}`);
  if (alert.url) lines.push("", `Product page: ${alert.url}`);
  lines.push("", "— AgentCart");
  return lines.join("\n");
}

/**
 * POST one email to Resend. Returns false when the feature is off or the
 * send failed — callers only log it.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  if (!emailEnabled() || !to.trim()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.email.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.email.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return true;
    await logWarn(`email rejected: http ${res.status}`);
    return false;
  } catch (err) {
    await logWarn(
      `email failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`,
    );
    return false;
  }
}

/**
 * Email the owner of a dropped item, when they saved an alert address and
 * the feature is configured. Fire-and-forget.
 */
export async function sendDropEmail(
  owner: unknown,
  alert: DropAlert,
): Promise<boolean> {
  try {
    if (!owner || !emailEnabled()) return false;
    const user = await User.findById(owner).select("settings.alertEmail").lean();
    const to = user?.settings?.alertEmail;
    if (!to) return false; // no address saved → alerts stay in-app
    const subject =
      alert.kind === "restock"
        ? `${alert.emoji} ${alert.title} is back in stock at ${alert.retailer}`
        : `${alert.emoji} ${alert.title} is $${alert.newPrice.toFixed(2)} at ${alert.retailer}`;
    return await sendEmail(to, subject, dropEmailBody(alert));
  } catch (err) {
    await logWarn(
      `email failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`,
      owner,
    );
    return false;
  }
}

// owner-scoped: delivery failures belong in the affected user's feed, not the
// system feed every signed-in account can read
async function logWarn(message: string, owner?: unknown): Promise<void> {
  try {
    await ActivityEvent.create({
      level: "warn",
      message,
      source: "email",
      owner: owner as Types.ObjectId | null | undefined,
    });
  } catch {
    // logging must never take down an email delivery attempt
  }
}
