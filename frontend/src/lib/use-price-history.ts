"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";

/** Price history entry from the backend. */
export interface PriceHistoryEntry {
  occurredAt: string;
  itemTitle: string;
  action: string;
  kind: "buy" | "alert" | "scan" | "info";
  price?: number | null;
}

/** Options for the price history hook. */
export interface UsePriceHistoryOptions {
  /** Watch item ID to fetch history for */
  itemId: string;
  /** Maximum number of entries to fetch (default: 30) */
  limit?: number;
  /** Optional kind filter: "buy" | "alert" | "scan" | "info" */
  kind?: "buy" | "alert" | "scan" | "info";
}

/** Hook that fetches price history for a specific watch item. */
export function usePriceHistory(options: UsePriceHistoryOptions) {
  const { itemId, limit = 30, kind } = options;
  const [entries, setEntries] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_BASE}/api/history/item/${itemId}`);
      url.searchParams.set("limit", String(limit));
      if (kind) url.searchParams.set("kind", kind);

      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error ?? "Failed to fetch price history");
        setEntries([]);
        return;
      }
      const data = (await res.json()) as { entries: PriceHistoryEntry[] };
      setEntries(data.entries ?? []);
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch price history");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [itemId, limit, kind]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { entries, loading, error, refetch: fetchHistory };
}