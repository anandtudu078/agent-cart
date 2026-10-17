export type WatchStatus = "watching" | "drop" | "paused";

export interface WatchedItem {
  id: string;
  title: string;
  retailer: string;
  emoji: string;
  price: number;
  target: number;
  deltaPct: number;
  status: WatchStatus;
  updated: string;
}

export interface HistoryEntry {
  id: string;
  item: string;
  action: string;
  detail: string;
  kind: "buy" | "alert" | "scan" | "info";
  at: string;
}

export const watchedItems: WatchedItem[] = [
  {
    id: "w-1",
    title: "Sony WH-1000XM5 Headphones",
    retailer: "Amazon",
    emoji: "🎧",
    price: 328.0,
    target: 300.0,
    deltaPct: -6.2,
    status: "drop",
    updated: "2m ago",
  },
  {
    id: "w-2",
    title: "Keychron Q1 Pro Keyboard",
    retailer: "Keychron",
    emoji: "⌨️",
    price: 199.0,
    target: 175.0,
    deltaPct: 0.0,
    status: "watching",
    updated: "11m ago",
  },
  {
    id: "w-3",
    title: "LG C4 42\" OLED TV",
    retailer: "Best Buy",
    emoji: "📺",
    price: 899.99,
    target: 799.0,
    deltaPct: -3.1,
    status: "watching",
    updated: "24m ago",
  },
  {
    id: "w-4",
    title: "Dyson V15 Detect",
    retailer: "Walmart",
    emoji: "🧹",
    price: 549.99,
    target: 450.0,
    deltaPct: 1.8,
    status: "paused",
    updated: "1h ago",
  },
  {
    id: "w-5",
    title: "Apple Watch Series 10",
    retailer: "Target",
    emoji: "⌚",
    price: 379.0,
    target: 340.0,
    deltaPct: -1.4,
    status: "watching",
    updated: "6m ago",
  },
];

export const historyEntries: HistoryEntry[] = [
  {
    id: "h-1",
    item: "Sony WH-1000XM5 Headphones",
    action: "Price drop detected",
    detail: "$350.00 → $328.00 on Amazon",
    kind: "alert",
    at: "10:42:18",
  },
  {
    id: "h-2",
    item: 'LG C4 42" OLED TV',
    action: "Target re-checked",
    detail: "$899.99 — still $100 above target",
    kind: "scan",
    at: "10:41:03",
  },
  {
    id: "h-3",
    item: "Keychron Q1 Pro Keyboard",
    action: "Cart held",
    detail: "Reserved in session before checkout step",
    kind: "buy",
    at: "10:37:55",
  },
  {
    id: "h-4",
    item: "Agent",
    action: "Cycle completed",
    detail: "5 items scanned in 8.3s, 0 errors",
    kind: "info",
    at: "10:35:12",
  },
  {
    id: "h-5",
    item: "Apple Watch Series 10",
    action: "Coupon found",
    detail: "TARGET10 applied at cart (-$19.00)",
    kind: "buy",
    at: "10:31:44",
  },
];

export const stats = [
  { label: "Active watches", value: "5", hint: "2 nearing target", icon: "eye" },
  { label: "Drops today", value: "3", hint: "$47 saved flags", icon: "trend" },
  { label: "Agent cycles", value: "128", hint: "avg 8.3s / cycle", icon: "bot" },
  { label: "Cart value", value: "$527", hint: "1 item reserved", icon: "cart" },
] as const;