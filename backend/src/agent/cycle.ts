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
import { fetchLivePrice, type PriceFetch } from "./fetch-price.js";
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

export interface OfferLike {
  retailer: string;
  url?: string | null;
  price: number;
}

/**
 * The offer a multi-retailer row is judged on: the cheapest one with a
 * usable price. Returns null when every offer is unusable — never invent a
 * winner out of zero candidates.
 */
export function bestOffer(offers: readonly OfferLike[]): OfferLike | null {
  let best: OfferLike | null = null;
  for (const offer of offers) {
    if (!Number.isFinite(offer.price) || offer.price <= 0) continue;
    if (best === null || offer.price < best.price) best = offer;
  }
  return best;
}

/**
 * True when an item is due for its next scan as of `now`.
 * Never-checked items are due immediately; otherwise
 * `lastCheckedAt + pollIntervalSec` must be in the past.
 */
export function isDue(
  lastCheckedAt: Date | null | undefined,
  pollIntervalSec: number,
  now: Date,
): boolean {
  if (!lastCheckedAt) return true;
  return lastCheckedAt.getTime() + pollIntervalSec * 1_000 <= now.getTime();
}

/** The watch-item document shape `runScanCycle` iterates over. */
type WatchItemDoc = NonNullable<Awaited<ReturnType<typeof WatchItem.findOne>>>;

/**
 * Whether this cycle should try to reserve the item for auto-buy.
 *
 * Two ways in: the price freshly hits target, or an item that sold out while
 * at target comes back (its status is already `drop`, so the fresh-drop branch
 * never fires again for it). Either way the item must be buyable now.
 */
export function shouldAutoBuy(input: {
  autoBuy: boolean;
  hitTarget: boolean;
  freshDrop: boolean;
  restocked: boolean;
  inStock: boolean;
}): boolean {
  if (!input.autoBuy || !input.hitTarget || !input.inStock) return false;
  return input.freshDrop || input.restocked;
}

/**
 * Hold `item` in the cart for auto-buy — the one place that decides between
 * "already reserved" and "create the entry". Shared by the fresh-drop and the
 * back-in-stock paths.
 */
async function reserveIntoCart(item: WatchItemDoc, price: number): Promise<void> {
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
    return;
  }
  await CartEntry.create({
    watchItem: item._id,
    itemTitle: item.title,
    retailer: item.retailer,
    emoji: item.emoji,
    price,
    currency: item.currency,
    owner: item.owner,
  });
  await HistoryEntry.create({
    item: item._id,
    itemTitle: item.title,
    action: "Auto-bought",
    detail: `Pulled into the cart at $${price.toFixed(2)} (target $${item.targetPrice.toFixed(2)}) — approve checkout to buy`,
    kind: "buy",
    price,
    owner: item.owner,
  });
  await log(
    "buy",
    `auto-buy: ${item.title} $${price.toFixed(2)} at ${item.retailer} — held in cart`,
    true,
    item.owner,
  );
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
    const now = new Date();
    const candidates = await WatchItem.find({ status: { $ne: "paused" } });
    // honor each item's own poll interval — only the due ones scan this cycle
    // (shortcut: filter in JS after the fetch; switch to a $dateAdd aggregation
    // when a user has hundreds of watched items)
    const items = candidates.filter((item) =>
      isDue(item.lastCheckedAt, item.pollIntervalSec, now),
    );
    await log(
      "info",
      `cycle started — ${items.length} of ${candidates.length} item(s) due`,
    );

    // nothing due → don't ping the agent service with an empty payload, but
    // still record the cycle so the dashboard countdown stays honest
    if (items.length === 0) {
      const summary: CycleSummary = {
        scanned: 0,
        drops: 0,
        durationMs: Date.now() - started,
        at: new Date().toISOString(),
      };
      lastCycleAt = new Date();
      lastSummary = summary;
      await log("info", "cycle complete — no items due, skipped scan");
      return summary;
    }

    // smart prices from the Python agent service; null → local jitter below
    // multi-retailer rows are priced by comparison, not by the agent — only
    // ask about the single-retailer ones, and skip the round trip entirely
    // when there are none left
    const solo = items.filter((item) => (item.offers ?? []).length === 0);
    const service =
      solo.length > 0
        ? await fetchPriceUpdates(
            solo.map((item) => ({
              id: item.id,
              title: item.title,
              retailer: item.retailer,
              price: item.price,
              targetPrice: item.targetPrice,
            })),
          )
        : null;

    // live fetches run together — one slow retailer must not serialize the
    // whole cycle (shortcut: unbounded fan-out; add a pool past ~50 items)
    const fetched: (PriceFetch | null)[][] = await Promise.all(
      items.map((item) => {
        const offers = item.offers ?? [];
        // multi-retailer rows poll every offer url — one slot per offer so the
        // results stay index-aligned with `item.offers`
        if (offers.length > 0) {
          return Promise.all(
            offers.map((offer) =>
              offer.url ? fetchLivePrice(offer.url, offer.price) : Promise.resolve(null),
            ),
          );
        }
        return item.url
          ? fetchLivePrice(item.url, item.price).then((result) => [result])
          : Promise.resolve([]);
      }),
    );

    let drops = 0;
    let liveOk = 0;
    let liveFailed = 0;
    let agentUsed = 0;
    const points: PricePointDoc[] = [];

    for (const [index, item] of items.entries()) {
      const oldPrice = item.price;
      const previousRetailer = item.retailer;
      const observedAt = new Date();
      // what we believed before this fetch — used to announce a sell-out once
      const wasInStock = item.inStock !== false;
      const results = fetched[index] ?? [];
      const offers = item.offers ?? [];
      const live = offers.length > 0 ? null : (results[0] ?? null);
      let nextPrice = oldPrice;
      let source: "live" | "agent-service" | "simulated" = "simulated";

      if (offers.length > 0) {
        // multi-retailer: poll every offer, then judge the row on the cheapest
        // one. A failed offer fetch keeps that offer's last real price, so a
        // dead retailer can never make an item look cheaper than it is.
        let anyLive = false;
        let anyUrl = false;
        for (const [position, offer] of offers.entries()) {
          if (!offer.url) {
            // no url → the same simulated walk a single-retailer row gets
            offer.price = jittered(offer.price);
            offer.fetchStatus = "simulated";
            offer.lastFetchError = undefined;
            continue;
          }
          anyUrl = true;
          const result = results[position] ?? null;
          if (result === null || result.ok === false) {
            const reason = result === null ? "no fetch attempted" : result.error;
            offer.fetchStatus = offer.fetchedAt ? "stale" : "error";
            offer.lastFetchError = reason.slice(0, 200);
            continue;
          }
          anyLive = true;
          offer.price = result.price;
          offer.fetchStatus = "ok";
          offer.lastFetchError = undefined;
          offer.fetchedAt = observedAt;
        }

        const best = bestOffer(offers);
        if (best === null) {
          liveFailed += 1;
          item.fetchStatus = item.fetchedAt ? "stale" : "error";
          item.lastFetchError = "no offer returned a usable price";
          item.lastCheckedAt = observedAt;
          await item.save();
          await log(
            "warn",
            `no usable offer: ${item.title} (${offers.length} retailers)`,
            false,
            item.owner,
          );
          continue;
        }

        nextPrice = best.price;
        source = anyLive ? "live" : "simulated";
        // headline mirrors the winner — cart, webhook and the chart read these
        item.retailer = best.retailer;
        if (best.url) item.url = best.url;
        item.fetchStatus = anyLive
          ? "ok"
          : anyUrl
            ? item.fetchedAt
              ? "stale"
              : "error"
            : "simulated";
        item.lastFetchError =
          anyLive || !anyUrl ? undefined : "every offer fetch failed";
        if (anyLive) {
          liveOk += 1;
          item.fetchedAt = observedAt;
        } else if (anyUrl) {
          liveFailed += 1;
        }

        if (best.retailer !== previousRetailer) {
          await HistoryEntry.create({
            item: item._id,
            itemTitle: item.title,
            action: "Cheapest offer changed",
            detail: `${previousRetailer} → ${best.retailer} at $${nextPrice.toFixed(2)} (cheapest of ${offers.length} offers)`,
            kind: "info",
            price: nextPrice,
            owner: item.owner,
          });
        }
      } else if (item.url) {
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
        // a page that says nothing keeps the previous belief
        if (live.inStock !== null) item.inStock = live.inStock;
      } else {
        // no url → agent service, then the built-in jitter
        item.fetchStatus = "simulated";
        item.lastFetchError = undefined;
        const suggested = service?.updates.get(item.id)?.price;
        if (suggested !== undefined) {
          nextPrice = suggested;
          source = "agent-service";
          agentUsed += 1;
        } else {
          nextPrice = jittered(oldPrice);
        }
      }

      const wasDrop = item.status === "drop";
      const hitTarget = item.targetPrice > 0 && nextPrice <= item.targetPrice;
      // sold out at the last scan, available again now
      const restocked = !wasInStock && item.inStock === true;

      item.price = nextPrice;
      item.deltaPct =
        oldPrice > 0
          ? Math.round(((nextPrice - oldPrice) / oldPrice) * 1000) / 10
          : 0;
      item.status = hitTarget ? "drop" : "watching";
      item.lastCheckedAt = observedAt;
      await item.save();

      if (wasInStock && item.inStock === false) {
        await HistoryEntry.create({
          item: item._id,
          itemTitle: item.title,
          action: "Out of stock",
          detail: `${item.retailer} reports it sold out — auto-buy is held off until it is back`,
          kind: "alert",
          price: nextPrice,
          owner: item.owner,
        });
        await log(
          "warn",
          `out of stock: ${item.title} at ${item.retailer} — auto-buy held off`,
          false,
          item.owner,
        );
      }

      if (restocked) {
        await HistoryEntry.create({
          item: item._id,
          itemTitle: item.title,
          action: "Back in stock",
          detail: `${item.retailer} reports it available again at $${nextPrice.toFixed(2)} — the hold on auto-buy is lifted`,
          kind: "alert",
          price: nextPrice,
          owner: item.owner,
        });
        await log(
          "ok",
          `back in stock: ${item.title} at ${item.retailer} — auto-buy resumed`,
          true, // same toast / desktop-notification path as a price drop
          item.owner,
        );
      }
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
        detail: `$${nextPrice.toFixed(2)} at ${item.retailer}${
          offers.length > 1 ? ` (cheapest of ${offers.length} offers)` : ""
        } — ${targetGap(nextPrice, item.targetPrice)}`,
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
        if (item.autoBuy && item.inStock === false) {
          await HistoryEntry.create({
            item: item._id,
            itemTitle: item.title,
            action: "Auto-buy skipped",
            detail: `Target hit at $${nextPrice.toFixed(2)} but ${item.retailer} has it out of stock — nothing reserved`,
            kind: "alert",
            price: nextPrice,
            owner: item.owner,
          });
          await log(
            "warn",
            `auto-buy skipped: ${item.title} is out of stock at ${item.retailer}`,
            false,
            item.owner,
          );
        } else if (
          shouldAutoBuy({
            autoBuy: item.autoBuy,
            hitTarget,
            freshDrop: true,
            restocked,
            inStock: item.inStock !== false,
          })
        ) {
          await reserveIntoCart(item, nextPrice);
        }
      } else if (
        // a sold-out item that comes back while still at/below target never
        // re-enters the fresh-drop branch above (its status stayed `drop`)
        // — this is the auto-buy it missed when it sold out
        shouldAutoBuy({
          autoBuy: item.autoBuy,
          hitTarget,
          freshDrop: false,
          restocked,
          inStock: item.inStock !== false,
        })
      ) {
        await reserveIntoCart(item, nextPrice);
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
              ? ` · agent-service for the rest (${agentUsed} items)`
              : ""
          }`
        : service
          ? `price source: agent-service (${service.source}, ${agentUsed}/${items.length} items)`
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
