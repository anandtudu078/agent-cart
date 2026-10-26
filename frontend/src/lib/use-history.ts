"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";

export type HistoryKind = "buy" | "alert" | "scan" | "info";

export interface HistoryEntry {
  id: string;
  item: string;
  itemId?: string;
  action: string;
  detail: string;
  kind: HistoryKind;
  at: string;
  price?: number;
}

interface RawEntry {
  _id: string;
  item?: string;
  itemTitle: string;
  action: string;
  detail: string;
  kind: HistoryKind;
  occurredAt: string;
  price?: number;
}

// shortcut: 15s polling to pick up agent-cycle updates — switch to SSE when
// stale-for-15s stops being acceptable
const POLL_MS = 15_000;

/** Recent agent decisions from GET /api/history (newest first). */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/history?limit=20`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data: { entries?: RawEntry[] }) => {
        setEntries(
          (data.entries ?? []).map((entry) => ({
            id: entry._id,
            item: entry.itemTitle,
            itemId: entry.item,
            action: entry.action,
            detail: entry.detail,
            kind: entry.kind,
            at: new Date(entry.occurredAt).toLocaleTimeString("en-US", {
              hour12: false,
            }),
            price: entry.price,
          })),
        );
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { entries, loading, refresh };
}

export interface PricePoint {
  at: string;
  price: number;
}

interface RawPoint {
  at: string;
  price: number;
  source: string;
}

/**
 * Price series for one watch item (for the chart) from
 * GET /api/watch-items/:id/series — real observed prices, oldest first.
 * Bypasses the hook pattern: callers load it on demand in their component.
 */
export async function fetchItemSeries(
  itemId: string,
): Promise<PricePoint[] | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/watch-items/${encodeURIComponent(itemId)}/series?limit=300`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { points?: RawPoint[] };
    const series = (data.points ?? [])
      .filter((point) => typeof point.price === "number")
      .map((point) => ({ ts: new Date(point.at), price: point.price }));
    if (series.length === 0) return [];

    // a same-day series reads as clock time; once it spans days the labels
    // need the date too or every point looks like a repeat
    const first = series[0]?.ts.getTime() ?? 0;
    const last = series[series.length - 1]?.ts.getTime() ?? 0;
    const spansDays = last - first > 24 * 3600 * 1000;
    return series.map(({ ts, price }) => ({
      at: spansDays
        ? ts.toLocaleString("en-US", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : ts.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }),
      price,
    }));
  } catch {
    return null;
  }
}
