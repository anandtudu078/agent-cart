"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "./api";

export type HistoryKind = "buy" | "alert" | "scan" | "info";

export interface HistoryEntry {
  id: string;
  item: string;
  action: string;
  detail: string;
  kind: HistoryKind;
  at: string;
}

interface RawEntry {
  _id: string;
  itemTitle: string;
  action: string;
  detail: string;
  kind: HistoryKind;
  occurredAt: string;
}

/** Recent agent decisions from GET /api/history (newest first). */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/history?limit=20`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data: { entries?: RawEntry[] }) => {
        if (!alive) return;
        setEntries(
          (data.entries ?? []).map((entry) => ({
            id: entry._id,
            item: entry.itemTitle,
            action: entry.action,
            detail: entry.detail,
            kind: entry.kind,
            at: new Date(entry.occurredAt).toLocaleTimeString("en-US", {
              hour12: false,
            }),
          })),
        );
      })
      .catch(() => {
        if (alive) setEntries([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { entries, loading };
}
