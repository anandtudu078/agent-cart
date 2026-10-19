"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";

export interface AgentStatus {
  running: boolean;
  intervalSec: number;
  lastCycleAt: string | null;
  lastSummary: { scanned: number; drops: number; durationMs: number } | null;
}

const TICK_MS = 1_000;
const REFRESH_MS = 5_000;

/** Agent loop state + countdown + "run now" for the dashboard header. */
export function useAgent() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  // starts at 0 and is set inside the effect — Next 16 forbids Date.now() at prerender
  const [now, setNow] = useState(0);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/agent/status`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgentStatus | null) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    refresh();
    // `now` stays 0 until the first 1s tick: Date.now() at render/effect time is
    // forbidden during Next 16 prerender and flagged by the react-hooks lint rule
    timer.current = window.setInterval(() => setNow(Date.now()), TICK_MS);
    const poll = window.setInterval(refresh, REFRESH_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      window.clearInterval(poll);
    };
  }, [refresh]);

  /** Seconds until the next scheduled cycle (null until the first tick). */
  const nextCycleAtMs = status?.lastCycleAt
    ? new Date(status.lastCycleAt).getTime() + status.intervalSec * 1000
    : null;
  const countdownSec =
    nextCycleAtMs !== null && now > 0
      ? Math.max(0, Math.ceil((nextCycleAtMs - now) / 1000))
      : null;

  /** Trigger a cycle now. Returns an error message or null on success. */
  const runNow = useCallback(async (): Promise<string | null> => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/scan`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        return data?.error ?? "scan failed — is the API running?";
      }
      refresh();
      return null;
    } catch {
      return "Could not reach the API (http://localhost:4000)";
    } finally {
      setScanning(false);
    }
  }, [refresh]);

  return { status, countdownSec, scanning, runNow, refresh };
}
