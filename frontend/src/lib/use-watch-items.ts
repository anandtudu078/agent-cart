"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";

export type WatchStatus = "watching" | "drop" | "paused";

/** Where the last price came from: live fetch, or why it wasn't. */
export type FetchStatus = "ok" | "stale" | "error" | "simulated";

/** Buy-now-or-wait verdict from the item's own price history. */
export type TrendVerdict = "rising" | "falling" | "flat" | "insufficient";

export interface Trend {
  verdict: TrendVerdict;
  /** % change of the newer half of the series vs the older half. */
  changePct: number;
}

export interface WatchedItem {
  id: string;
  title: string;
  retailer: string;
  emoji: string;
  price: number;
  target: number;
  deltaPct: number;
  status: WatchStatus;
  autoBuy: boolean;
  fetchStatus: FetchStatus;
  lastFetchError?: string;
  trend: Trend;
  updated: string;
}

interface RawItem {
  _id: string;
  title: string;
  retailer: string;
  emoji?: string;
  price: number;
  targetPrice: number;
  deltaPct?: number;
  status: WatchStatus;
  autoBuy?: boolean;
  fetchStatus?: FetchStatus;
  lastFetchError?: string;
  trend?: Trend;
  lastCheckedAt?: string;
  createdAt?: string;
}

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** Fields the create form sends to POST /api/watch-items. */
export interface NewWatchItem {
  title: string;
  retailer: string;
  price: number;
  targetPrice: number;
  /** Product page — when set, the agent fetches the live price from it. */
  url?: string;
}

/** Live watchlist from GET /api/watch-items, with add/remove mutations. */
export function useWatchItems() {
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/watch-items`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: RawItem[] }) => {
        setItems(
          (data.items ?? []).map((item) => ({
            id: item._id,
            title: item.title,
            retailer: item.retailer,
            emoji: item.emoji ?? "🛍️",
            price: item.price,
            target: item.targetPrice,
            deltaPct: item.deltaPct ?? 0,
            status: item.status,
            autoBuy: item.autoBuy ?? false,
            fetchStatus: item.fetchStatus ?? "simulated",
            lastFetchError: item.lastFetchError,
            trend: item.trend ?? { verdict: "insufficient", changePct: 0 },
            updated: timeAgo(item.lastCheckedAt ?? item.createdAt),
          })),
        );
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  // shortcut: 15s polling to pick up agent-cycle updates — switch to SSE or
  // websockets when stale-for-15s stops being acceptable
  useEffect(() => {
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  /** POST a new watch item; returns an error message or null on success. */
  const add = useCallback(
    async (input: NewWatchItem): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/api/watch-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          return data?.error ?? "Could not add the item — is the API running?";
        }
        refresh();
        return null;
      } catch {
        return "Could not reach the API (http://localhost:4000)";
      }
    },
    [refresh],
  );

  /** PATCH a watch item (status/target); returns an error or null on success. */
  const setItem = useCallback(
    async (
      id: string,
      patch: { status?: WatchStatus; targetPrice?: number; autoBuy?: boolean },
    ): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/api/watch-items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          return data?.error ?? "could not update the item";
        }
        refresh();
        return null;
      } catch {
        return "Could not reach the API (http://localhost:4000)";
      }
    },
    [refresh],
  );

  /** DELETE a watch item; returns true on success. */
  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE}/api/watch-items/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) {
          setItems((prev) => prev.filter((item) => item.id !== id));
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  return { items, loading, refresh, add, remove, setItem };
}
