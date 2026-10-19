"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";

export interface ActivityLine {
  id: number;
  time: string;
  level: "info" | "ok" | "warn" | "buy";
  message: string;
}

const MAX_LINES = 40;

/** Live tail of /api/activity/stream (SSE), capped at MAX_LINES. */
export function useActivityFeed() {
  const [lines, setLines] = useState<ActivityLine[]>([]);
  const [connected, setConnected] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    // withCredentials: the stream is behind the session cookie now
    const source = new EventSource(`${API_BASE}/api/activity/stream`, {
      withCredentials: true,
    });
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