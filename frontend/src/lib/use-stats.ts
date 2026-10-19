"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";

/** Dashboard stat cards, derived from the watchlist + history APIs. */
export interface Stats {
  active: number; // items not paused
  nearing: number; // active items within NEARING_PCT of their target
  drops: number; // items flagged below target
  saved: number; // total $ below target across flagged drops
  decisions: number; // history entries in the agent log
  alerts: number; // history entries of kind "alert"
  buys: number; // history entries of kind "buy"
  cartItems: number; // reserved cart entries
  cartTotal: number; // total $ reserved in the cart
}

const EMPTY: Stats = {
  active: 0,
  nearing: 0,
  drops: 0,
  saved: 0,
  decisions: 0,
  alerts: 0,
  buys: 0,
  cartItems: 0,
  cartTotal: 0,
};

// shortcut: "nearing target" is a fixed 5% band — revisit if operators want it configurable
const NEARING_PCT = 5;
// shortcut: history is pulled at the ?limit= cap — revisit with cursor paging when the log outgrows 100 entries
const HISTORY_LIMIT = 100;

interface RawItem {
  status: string;
  price: number;
  targetPrice: number;
}
interface RawEntry {
  kind: string;
}

/** Live stats for the dashboard header cards. */
export function useStats() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE}/api/watch-items`).then((res) =>
        res.ok ? res.json() : { items: [] },
      ),
      fetch(`${API_BASE}/api/history?limit=${HISTORY_LIMIT}`).then((res) =>
        res.ok ? res.json() : { entries: [] },
      ),
      fetch(`${API_BASE}/api/cart`).then((res) =>
        res.ok ? res.json() : { entries: [], total: 0 },
      ),
    ])
      .then(([itemsData, entriesData, cartData]) => {
        const items = (itemsData as { items?: RawItem[] }).items ?? [];
        const entries = (entriesData as { entries?: RawEntry[] }).entries ?? [];
        const cart = cartData as { entries?: unknown[]; total?: number };

        const next: Stats = { ...EMPTY, decisions: entries.length };
        for (const item of items) {
          const active = item.status !== "paused";
          if (active) next.active += 1;
          if (item.status === "drop") {
            next.drops += 1;
            next.saved += Math.max(item.targetPrice - item.price, 0);
          }
          if (
            active &&
            item.price > 0 &&
            item.price <= item.targetPrice * (1 + NEARING_PCT / 100)
          ) {
            next.nearing += 1;
          }
        }
        for (const entry of entries) {
          if (entry.kind === "alert") next.alerts += 1;
          if (entry.kind === "buy") next.buys += 1;
        }
        next.cartItems = cart.entries?.length ?? 0;
        next.cartTotal = cart.total ?? 0;
        setStats(next);
      })
      .catch(() => setStats(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  // shortcut: 15s polling to pick up agent-cycle updates; revisit with push updates
  useEffect(() => {
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { stats, loading, refresh };
}
