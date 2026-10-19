"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";

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

interface RawItem {
  _id: string;
  title: string;
  retailer: string;
  emoji?: string;
  price: number;
  targetPrice: number;
  deltaPct?: number;
  status: WatchStatus;
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

  return { items, loading, refresh, add, remove };
}
