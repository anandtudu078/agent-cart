"use client";

import { Activity, Play } from "lucide-react";
import { useAgent } from "@/lib/use-agent";

/**
 * Header badge: real countdown to the next scan cycle, plus a manual
 * "run now" button. Replaces the old hardcoded "next cycle in 30s".
 */
export function AgentStatusBadge() {
  const { status, countdownSec, scanning, runNow } = useAgent();

  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1.5 font-mono text-xs text-muted">
        <Activity className="h-3.5 w-3.5 text-amber-400" aria-hidden />
        agent offline — is the API running?
      </div>
    );
  }

  const label = status.running
    ? "scanning…"
    : countdownSec === null
      ? "waiting for first cycle"
      : `next cycle in ${countdownSec}s`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1.5 font-mono text-xs text-muted">
        <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        {label}
      </div>
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
