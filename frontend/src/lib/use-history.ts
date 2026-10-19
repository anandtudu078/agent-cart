"use client";

import { useCallback, useEffect, useState } from "react";
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
            action: entry.action,
            detail: entry.detail,
            kind: entry.kind,
            at: new Date(entry.occurredAt).toLocaleTimeString("en-US", {
              hour12: false,
            }),
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
