import { ActivityEvent, HistoryEntry, User } from "../models/index.js";
import { env } from "../config/env.js";
import { emailEnabled, sendEmail } from "./email.js";

/**
 * Daily email digest: one summary per user of everything their agent did in
 * the last 24 hours — the drops a missed toast or muted webhook would have
 * hidden.
 *
 * shortcut: an in-process timer (like the scan loop), one instance, UTC
 * hours, at most one digest per calendar day. Move to a real scheduler when
 * the API runs on more than one machine — two instances would double-send.
 */
const DAY_MS = 86_400_000;
const CHECK_MS = 60_000;
const MAX_LINES = 50;

export interface DigestEntry {
  itemTitle: string;
  action: string;
  occurredAt: Date;
}

/** Render the digest — exported so the body is testable. */
export function digestBody(
  entries: readonly DigestEntry[],
): { subject: string; text: string } {
  const subject = `AgentCart daily digest — ${entries.length} alert${
    entries.length === 1 ? "" : "s"
  } in the last 24h`;
  const lines = entries.map(
    (entry) => `• ${entry.action}: ${entry.itemTitle}`,
  );
  const text = [
    "Here's what your price-watch agent found in the last 24 hours:",
    "",
    ...lines,
    "",
    "— AgentCart",
  ].join("\n");
  return { subject, text };
}

/** Email every user who saved an alert address; returns how many were sent. */
export async function runDailyDigest(): Promise<number> {
  if (!emailEnabled()) return 0;
  const since = new Date(Date.now() - DAY_MS);
  const users = await User.find({ "settings.alertEmail": { $ne: "" } })
    .select("settings.alertEmail")
    .lean();

  let sent = 0;
  for (const user of users) {
    const entries = await HistoryEntry.find({
      owner: user._id,
      kind: { $in: ["alert", "buy"] },
      occurredAt: { $gte: since },
    })
      .sort({ occurredAt: -1 })
      .limit(MAX_LINES)
      .lean();
    if (entries.length === 0) continue;
    const { subject, text } = digestBody(
      entries.map((entry) => ({
        itemTitle: entry.itemTitle,
        action: entry.action,
        occurredAt: entry.occurredAt,
      })),
    );
    if (await sendEmail(user.settings.alertEmail, subject, text)) sent += 1;
  }
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;
// the calendar day the digest already went out — survives a slow hour tick
let lastRunDay = "";

async function tick(): Promise<void> {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getUTCHours() !== env.digestHour || lastRunDay === today) return;
    lastRunDay = today;
    const sent = await runDailyDigest();
    await ActivityEvent.create({
      level: "info",
      message: `daily digest — emailed ${sent} user(s)`,
      source: "digest",
    });
  } catch (err) {
    try {
      await ActivityEvent.create({
        level: "warn",
        message: `daily digest failed: ${
          err instanceof Error ? err.message.slice(0, 120) : "unknown error"
        }`,
        source: "digest",
      });
    } catch {
      // never let digest logging crash the timer
    }
  }
}

/** Start the digest timer; call once after the DB is connected. */
export function startDigestTimer(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), CHECK_MS).unref();
  console.log(`✓ Daily email digest timer running (hour ${env.digestHour} UTC)`);
}
