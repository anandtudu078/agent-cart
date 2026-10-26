import type { Types } from "mongoose";
import {
  WatchItem,
  HistoryEntry,
  ActivityEvent,
  CartEntry,
  PricePoint,
  type PricePointDoc,
} from "../models/index.js";
import { env } from "../config/env.js";
import { fetchPriceUpdates } from "./service.js";
import { fetchLivePrice } from "./fetch-price.js";
import { sendDropAlert } from "./webhook.js";

export interface CycleSummary {
  scanned: number;
  drops: number;
  durationMs: number;
  at: string;
}

let running = false;
let intervalSec = env.agent.intervalSec;
let loopTimer: ReturnType<typeof setInterval> | null = null;
let lastCycleAt: Date | null = null;
let lastSummary: CycleSummary | null = null;

// last resort for items with no product URL: the "price check" is a random
// walk (±3%), not a real scrape — items carrying a url are fetched live
const JITTER = 0.03;

/** Mutable state for GET /api/agent/status. */
export function agentState() {
  return {
    running,
    intervalSec,
    lastCycleAt: lastCycleAt?.toISOString() ?? null,
    lastSummary,
  };
}

/** Current scan interval in seconds (mutable via PATCH /api/agent/settings). */
export function agentIntervalSec(): number {
  return intervalSec;
}

/**
 * Change the scan interval at runtime and restart the timer. Clamped by the
 * caller; the loop only restarts when it was already started.
 */
export function setAgentIntervalSec(sec: number): void {
  intervalSec = sec;
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = setInterval(tick, sec * 1000).unref();
  }
}

async function log(
  level: "info" | "ok" | "warn" | "buy",
  message: string,
  alert = false,
  /** null/undefined = system line visible to every signed-in user. */
  owner?: Types.ObjectId | string | null,
): Promise<void> {
  await ActivityEvent.create({
    level,
    message,
    source: "agent-cycle",
    alert,
    owner,
  });
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

    // smart prices from the Python agent service; null → local jitter below
    const service = await fetchPriceUpdates(
      items.map((item) => ({
        id: item.id,
        title: item.title,
        retailer: item.retailer,
        price: item.price,
        targetPrice: item.targetPrice,
      })),
    );

    // live fetches run together — one slow retailer must not serialize the
    // whole cycle (shortcut: unbounded fan-out; add a pool past ~50 items)
    const fetched = await Promise.all(
      items.map((item) =>
        item.url ? fetchLivePrice(item.url, item.price) : Promise.resolve(null),
      ),
    );

    let drops = 0;
    let liveOk = 0;
    let liveFailed = 0;
    const points: PricePointDoc[] = [];

    for (const [index, item] of items.entries()) {
      const oldPrice = item.price;
      const observedAt = new Date();
      const live = fetched[index] ?? null;
      let nextPrice = oldPrice;
      let source: "live" | "agent-service" | "simulated" = "simulated";

      if (item.url) {
        // a failed fetch keeps the last real price untouched: better a stale
        // row marked stale than a fabricated one
        if (live === null || live.ok === false) {
          const reason = live === null ? "no fetch attempted" : live.error;
          liveFailed += 1;
          item.fetchStatus = item.fetchedAt ? "stale" : "error";
          item.lastFetchError = reason.slice(0, 200);
          item.lastCheckedAt = observedAt;
          await item.save();
          await log(
            "warn",
            `price fetch failed: ${item.title} at ${item.retailer} — ${reason}`,
            false,
            item.owner,
          );
          continue;
        }
        liveOk += 1;
        nextPrice = live.price;
        source = "live";
        item.fetchStatus = "ok";
        item.lastFetchError = undefined;
        item.fetchedAt = observedAt;
      } else {
        // no url → agent service, then the built-in jitter
        item.fetchStatus = "simulated";
        item.lastFetchError = undefined;
        const suggested = service?.updates.get(item.id)?.price;
        if (suggested !== undefined) {
          nextPrice = suggested;
          source = "agent-service";
        } else {
          nextPrice = jittered(oldPrice);
        }
      }

      const wasDrop = item.status === "drop";
      const hitTarget = item.targetPrice > 0 && nextPrice <= item.targetPrice;

      item.price = nextPrice;
      item.deltaPct =
        oldPrice > 0
          ? Math.round(((nextPrice - oldPrice) / oldPrice) * 1000) / 10
          : 0;
      item.status = hitTarget ? "drop" : "watching";
      item.lastCheckedAt = observedAt;
      await item.save();

      // one honest observation per item per cycle — the chart reads these
      points.push({
        item: item._id,
        price: nextPrice,
        at: observedAt,
        source,
        owner: item.owner,
      });

      await HistoryEntry.create({
        item: item._id,
        itemTitle: item.title,
        action: "Target re-checked",
        detail: `$${nextPrice.toFixed(2)} at ${item.retailer} — ${targetGap(nextPrice, item.targetPrice)}`,
        kind: "scan",
        price: nextPrice,
        owner: item.owner,
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
          owner: item.owner,
        });
        await log(
          "warn",
          `price drop: ${item.title} $${oldPrice.toFixed(2)} → $${nextPrice.toFixed(2)} at ${item.retailer}`,
          true, // surfaced as a toast/desktop notification on the dashboard
          item.owner,
        );
        // out-of-app alert — fire-and-forget so a dead webhook can't stall
        // the cycle that found the drop
        void sendDropAlert(item.owner, {
          itemId: item.id,
          title: item.title,
          retailer: item.retailer,
          emoji: item.emoji,
          url: item.url ?? undefined,
          oldPrice,
          newPrice: nextPrice,
          targetPrice: item.targetPrice,
          currency: item.currency,
          autoBuy: item.autoBuy,
        });
        if (item.autoBuy) {
          const held = await CartEntry.findOne({
            watchItem: item._id,
            status: "reserved",
          });
          if (held) {
            await log(
              "info",
              `auto-buy skipped: ${item.title} is already in the cart`,
              false,
              item.owner,
            );
          } else {
            await CartEntry.create({
              watchItem: item._id,
              itemTitle: item.title,
              retailer: item.retailer,
              emoji: item.emoji,
              price: item.price,
              currency: item.currency,
              owner: item.owner,
            });
            await HistoryEntry.create({
              item: item._id,
              itemTitle: item.title,
              action: "Auto-bought",
              detail: `Pulled into the cart at $${nextPrice.toFixed(2)} (target $${item.targetPrice.toFixed(2)}) — approve checkout to buy`,
              kind: "buy",
              price: nextPrice,
              owner: item.owner,
            });
            await log(
              "buy",
              `auto-buy: ${item.title} $${nextPrice.toFixed(2)} at ${item.retailer} — held in cart`,
              true,
              item.owner,
            );
          }
        }
      }
    }

    if (points.length) await PricePoint.insertMany(points);

    const summary: CycleSummary = {
      scanned: items.length,
      drops,
      durationMs: Date.now() - started,
      at: new Date().toISOString(),
    };
    lastCycleAt = new Date();
    lastSummary = summary;
    await log(
      "info",
      liveOk + liveFailed > 0
        ? `price source: live fetch ${liveOk}/${liveOk + liveFailed} ok${
            liveFailed
              ? `, ${liveFailed} kept at last known price`
              : ""
          }${
            service
              ? ` · agent-service for the rest (${service.updates.size} items)`
              : ""
          }`
        : service
          ? `price source: agent-service (${service.source}, ${service.updates.size}/${items.length} items)`
          : "price source: local jitter (agent service unreachable)",
    );
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
  console.log(`✓ Agent scan loop running every ${intervalSec}s`);
  loopTimer = setInterval(tick, intervalSec * 1000).unref();
}
