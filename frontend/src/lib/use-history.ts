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

/**
 * Fetch the price series for one watch item (for the chart). Bypasses the
 * hook pattern — callers load it on demand inside their own component.
 */
export async function fetchItemSeries(
  itemId: string,
): Promise<PricePoint[] | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/history?item=${encodeURIComponent(itemId)}&limit=100`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { entries?: RawEntry[] };
    // oldest first so the chart reads left-to-right in time
    return (data.entries ?? [])
      .filter((entry) => typeof entry.price === "number")
      .map((entry) => ({
        at: new Date(entry.occurredAt).toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        }),
        price: entry.price!,
      }))
      .reverse();
  } catch {
    return null;
  }
}
