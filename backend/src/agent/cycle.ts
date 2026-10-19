import { WatchItem, HistoryEntry, ActivityEvent } from "../models/index.js";
import { env } from "../config/env.js";

export interface CycleSummary {
  scanned: number;
  drops: number;
  durationMs: number;
  at: string;
}

let running = false;
let lastCycleAt: Date | null = null;
let lastSummary: CycleSummary | null = null;

// shortcut: the "price check" is a random walk (±3%), not a real scrape —
// upgrade to the Python/LangChain fetcher when retailer scraping lands
const JITTER = 0.03;

/** Mutable state for GET /api/agent/status. */
export function agentState() {
  return {
    running,
    lastCycleAt: lastCycleAt?.toISOString() ?? null,
    lastSummary,
  };
}

async function log(
  level: "info" | "ok" | "warn" | "buy",
  message: string,
  alert = false,
): Promise<void> {
  await ActivityEvent.create({ level, message, source: "agent-cycle", alert });
}

function jittered(price: number): number {
  const delta = (Math.random() * 2 - 1) * JITTER;
  return Math.max(1, Math.round(price * (1 + delta) * 100) / 100);
}

function targetGap(price: number, target: number): string {
  if (price <= target) return `$${(target - price).toFixed(2)} below target`;
  return `still $${(price - target).toFixed(2)} above target`;
}

/**
 * One scan cycle: re-check every non-paused watch item, nudge its price,
 * recompute delta/status, and record each decision in history + activity.
 * Returns null when a cycle is already in flight.
 */
export async function runScanCycle(): Promise<CycleSummary | null> {
  if (running) return null;
  running = true;
  const started = Date.now();
  try {
    const items = await WatchItem.find({ status: { $ne: "paused" } });
    await log("info", `cycle started — ${items.length} item(s) queued`);

    let drops = 0;
    for (const item of items) {
      const oldPrice = item.price;
      const nextPrice = jittered(oldPrice);
      const wasDrop = item.status === "drop";
      const hitTarget = item.targetPrice > 0 && nextPrice <= item.targetPrice;

      item.price = nextPrice;
      item.deltaPct =
        oldPrice > 0
          ? Math.round(((nextPrice - oldPrice) / oldPrice) * 1000) / 10
          : 0;
      item.status = hitTarget ? "drop" : "watching";
      item.lastCheckedAt = new Date();
      await item.save();

      await HistoryEntry.create({
        item: item._id,
        itemTitle: item.title,
        action: "Target re-checked",
        detail: `$${nextPrice.toFixed(2)} at ${item.retailer} — ${targetGap(nextPrice, item.targetPrice)}`,
        kind: "scan",
        price: nextPrice,
      });

      if (hitTarget && !wasDrop) {
        drops += 1;
        await HistoryEntry.create({
          item: item._id,
          itemTitle: item.title,
          action: "Price drop detected",
          detail: `$${oldPrice.toFixed(2)} → $${nextPrice.toFixed(2)} on ${item.retailer} (target $${item.targetPrice.toFixed(2)})`,
          kind: "alert",
          price: nextPrice,
        });
        await log(
          "warn",
          `price drop: ${item.title} $${oldPrice.toFixed(2)} → $${nextPrice.toFixed(2)} at ${item.retailer}`,
          true, // surfaced as a toast/desktop notification on the dashboard
        );
      }
    }

    const summary: CycleSummary = {
      scanned: items.length,
      drops,
      durationMs: Date.now() - started,
      at: new Date().toISOString(),
    };
    lastCycleAt = new Date();
    lastSummary = summary;
    await log(
      "ok",
      `cycle completed — ${summary.scanned} item(s) scanned in ${summary.durationMs}ms, ${summary.drops} drop(s) flagged`,
    );
    return summary;
  } catch (err) {
    await log(
      "warn",
      `cycle failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    running = false;
  }
}

/** Fire-and-forget cycle for the background timer. */
function tick(): void {
  void runScanCycle();
}

/** Start the interval loop; call once after the DB is connected. */
export function startAgentLoop(): void {
  const ms = env.agent.intervalSec * 1000;
  console.log(`✓ Agent scan loop running every ${env.agent.intervalSec}s`);
  setInterval(tick, ms).unref();
}
