"use client";

import { useState } from "react";
import { Activity, Play } from "lucide-react";
import { useAgent } from "@/lib/use-agent";

const INTERVAL_OPTIONS = [
  { sec: 15, label: "15s" },
  { sec: 30, label: "30s" },
  { sec: 60, label: "1m" },
  { sec: 300, label: "5m" },
];

/**
 * Header badge: real countdown to the next scan cycle, a manual
 * "run now" button, and the scan-interval picker.
 */
export function AgentStatusBadge() {
  const { status, countdownSec, scanning, runNow, updateInterval } = useAgent();
  const [intervalError, setIntervalError] = useState<string | null>(null);

  async function changeInterval(sec: number) {
    const err = await updateInterval(sec);
    setIntervalError(err);
    if (!err) window.setTimeout(() => setIntervalError(null), 4_000);
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1.5 font-mono text-xs text-muted">
        <Activity className="h-3.5 w-3.5 text-amber-400" aria-hidden />
        agent offline — is the API running?
      </div>
    );
  }

  const label = intervalError
    ? intervalError
    : status.running
      ? "scanning…"
      : countdownSec === null
        ? "waiting for first cycle"
        : `next cycle in ${countdownSec}s`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1.5 font-mono text-xs text-muted">
        <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        {label}
      </div>
      <label className="flex items-center gap-1.5 rounded-full border border-panel-border bg-panel px-3 py-1.5 font-mono text-xs text-muted">
        every
        <select
          value={status.intervalSec}
          onChange={(e) => void changeInterval(Number(e.target.value))}
          aria-label="Scan interval"
          className="bg-transparent font-mono text-xs text-zinc-300 outline-none"
        >
          {INTERVAL_OPTIONS.map((option) => (
            <option key={option.sec} value={option.sec} className="bg-panel">
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={scanning || status.running}
        onClick={() => void runNow()}
        className="flex items-center gap-1.5 rounded-full border border-panel-border bg-panel px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-400 disabled:opacity-50"
      >
        <Play className="h-3 w-3" aria-hidden />
        {scanning || status.running ? "scanning…" : "run cycle now"}
      </button>
    </div>
  );
}
