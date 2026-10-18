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

/** Live watchlist from GET /api/watch-items. */
export function useWatchItems() {
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/watch-items`)
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

  return { items, loading, refresh };
}
