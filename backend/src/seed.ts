import mongoose from "mongoose";
import { env } from "./config/env.js";
import { redactMongoUri } from "./config/log.js";
import { ActivityEvent, CartEntry, HistoryEntry, WatchItem } from "./models/index.js";

const RESET = process.argv.includes("--reset");

// shortcut: demo rows carry no product URL on purpose — a live fetch of
// these fake paths would 404 every cycle and freeze the demo prices. No url
// = the agent simulates, and the watchlist chip says so (`simulated`).
const ITEMS = [
  {
    title: "Sony WH-1000XM5 Headphones",
    retailer: "Amazon",
    emoji: "🎧",
    price: 328.0,
    targetPrice: 300.0,
    deltaPct: -6.2,
    status: "drop" as const,
    lastCheckedAt: new Date(Date.now() - 2 * 60_000),
  },
  {
    title: "Keychron Q1 Pro Keyboard",
    retailer: "Keychron",
    emoji: "⌨️",
    price: 199.0,
    targetPrice: 175.0,
    deltaPct: 0,
    status: "watching" as const,
    lastCheckedAt: new Date(Date.now() - 11 * 60_000),
  },
  {
    title: 'LG C4 42" OLED TV',
    retailer: "Best Buy",
    emoji: "📺",
    price: 899.99,
    targetPrice: 799.0,
    deltaPct: -3.1,
    status: "watching" as const,
    lastCheckedAt: new Date(Date.now() - 24 * 60_000),
  },
  {
    title: "Dyson V15 Detect",
    retailer: "Walmart",
    emoji: "🧹",
    price: 549.99,
    targetPrice: 450.0,
    deltaPct: 1.8,
    status: "paused" as const,
    lastCheckedAt: new Date(Date.now() - 60 * 60_000),
  },
  {
    title: "Apple Watch Series 10",
    retailer: "Target",
    emoji: "⌚",
    price: 379.0,
    targetPrice: 340.0,
    deltaPct: -1.4,
    status: "watching" as const,
    lastCheckedAt: new Date(Date.now() - 6 * 60_000),
  },
];

const HISTORY = [
  {
    itemTitle: "Sony WH-1000XM5 Headphones",
    action: "Price drop detected",
    detail: "$350.00 → $328.00 on Amazon",
    kind: "alert" as const,
    occurredAt: new Date(Date.now() - 6 * 60_000),
  },
  {
    itemTitle: 'LG C4 42" OLED TV',
    action: "Target re-checked",
    detail: "$899.99 — still $100 above target",
    kind: "scan" as const,
    occurredAt: new Date(Date.now() - 7 * 60_000),
  },
  {
    itemTitle: "Keychron Q1 Pro Keyboard",
    action: "Cart held",
    detail: "Reserved in session before checkout step",
    kind: "buy" as const,
    occurredAt: new Date(Date.now() - 11 * 60_000),
  },
  {
    itemTitle: "Agent",
    action: "Cycle completed",
    detail: "5 items scanned in 8.3s, 0 errors",
    kind: "info" as const,
    occurredAt: new Date(Date.now() - 14 * 60_000),
  },
  {
    itemTitle: "Apple Watch Series 10",
    action: "Coupon found",
    detail: "TARGET10 applied at cart (-$19.00)",
    kind: "buy" as const,
    occurredAt: new Date(Date.now() - 18 * 60_000),
  },
];

const ACTIVITY = [
  { level: "ok" as const, message: "drop detected: Sony WH-1000XM5 → $328.00", source: "price-watch" },
  { level: "info" as const, message: "GET amazon.com/dp/B09XS7JWHH → 200 (412ms)", source: "scraper" },
  { level: "info" as const, message: "cycle #128 started — 5 items queued", source: "scheduler" },
  { level: "buy" as const, message: "cart held: Keychron Q1 Pro (session #42)", source: "checkout" },
  { level: "warn" as const, message: "rate-limit hint on walmart.com — backing off 2s", source: "scraper" },
];

/**
 * Safe to run repeatedly: every row is upserted on a stable natural key, so
 * running the seed against a populated (e.g. Atlas) cluster never creates
 * duplicates. Pass --reset to wipe the four demo collections first.
 */
async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log(`✓ connected — ${redactMongoUri(env.mongoUri)}`);

  if (RESET) {
    const [w, h, a, c] = await Promise.all([
      WatchItem.deleteMany({}),
      HistoryEntry.deleteMany({}),
      ActivityEvent.deleteMany({}),
      CartEntry.deleteMany({}),
    ]);
    console.log(
      `  --reset cleared ${w.deletedCount}/${h.deletedCount}/${a.deletedCount}/${c.deletedCount} docs`,
    );
  }

  let itemsCreated = 0;
  for (const item of ITEMS) {
    const res = await WatchItem.updateOne(
      { title: item.title },
      { $set: item },
      { upsert: true },
    );
    itemsCreated += res.upsertedCount;
  }

  let historyCreated = 0;
  for (const entry of HISTORY) {
    const res = await HistoryEntry.updateOne(
      { itemTitle: entry.itemTitle, action: entry.action, detail: entry.detail },
      { $set: entry },
      { upsert: true },
    );
    historyCreated += res.upsertedCount;
  }

  let activityCreated = 0;
  for (const event of ACTIVITY) {
    const res = await ActivityEvent.updateOne(
      { level: event.level, message: event.message },
      { $set: event },
      { upsert: true },
    );
    activityCreated += res.upsertedCount;
  }

  const [items, history, activity] = await Promise.all([
    WatchItem.countDocuments(),
    HistoryEntry.countDocuments(),
    ActivityEvent.countDocuments(),
  ]);

  console.log(
    `✓ seed done — inserted ${itemsCreated}/${historyCreated}/${activityCreated} new docs`,
  );
  console.log(
    `  totals: watch_items=${items}, history_entries=${history}, activity_events=${activity}`,
  );
}

run()
  .then(() => mongoose.connection.close())
  .catch(async (err) => {
    console.error("[seed] failed:", err instanceof Error ? err.message : err);
    await mongoose.connection.close();
    process.exitCode = 1;
  });