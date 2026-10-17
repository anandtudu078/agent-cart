"use client";

import { useEffect, useRef, useState } from "react";

export interface ActivityLine {
  id: number;
  time: string;
  level: "info" | "ok" | "warn" | "buy";
  message: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_LINES = 40;

/** Live tail of /api/activity/stream (SSE), capped at MAX_LINES. */
export function useActivityFeed() {
  const [lines, setLines] = useState<ActivityLine[]>([]);
  const [connected, setConnected] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/activity/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (msg) => {
      const data = JSON.parse(msg.data) as {
        createdAt: string;
        level: ActivityLine["level"];
        message: string;
      };
      setLines((prev) => {
        const next = [
          ...prev,
          {
            id: nextId.current++,
            time: new Date(data.createdAt).toLocaleTimeString("en-US", {
              hour12: false,
            }),
            level: data.level,
            message: data.message,
          },
        ];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    };
    return () => source.close();
  }, []);

  return { lines, connected };
}