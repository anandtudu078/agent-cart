"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";

export interface DropAlert {
  id: number;
  message: string;
  at: string;
}

const MAX_TOASTS = 4;

/**
 * Watches the activity SSE stream for lines flagged `alert: true` (price
 * drops) and exposes them as toasts. Reconnect replays are deduped by
 * createdAt+message so a dropped connection never re-fires old alerts.
 */
export function useDropAlerts() {
  const [toasts, setToasts] = useState<DropAlert[]>([]);
  const nextId = useRef(0);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/activity/stream`, {
      withCredentials: true,
    });
    source.onmessage = (msg) => {
      const data = JSON.parse(msg.data) as {
        createdAt: string;
        message: string;
        alert?: boolean;
      };
      if (!data.alert) return;
      const key = `${data.createdAt}|${data.message}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > 200) seen.current.clear(); // shortcut: bounded dedupe memory; fine for a 2s-polled feed
      setToasts((prev) => {
        const next = [
          ...prev,
          { id: nextId.current++, message: data.message, at: data.createdAt },
        ];
        return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
      });
    };
    return () => source.close();
  }, []);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((toast) => toast.id !== id));

  return { toasts, dismiss };
}
