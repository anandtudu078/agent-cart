"use client";

import { useHistory } from "@/lib/use-history";

const HISTORY_DOT = {
  buy: "bg-fuchsia-400",
  alert: "bg-cyan-400",
  scan: "bg-zinc-500",
  info: "bg-emerald-400",
} as const;

/** Recent agent decisions backed by GET /api/history (replaces mock data). */
export function HistoryFeed() {
  const { entries, loading } = useHistory();

  if (loading) {
    return (
      <div className="rounded-xl border border-panel-border bg-panel/60 p-8 text-center font-mono text-sm text-muted">
        loading history…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-panel-border bg-panel/60 p-8 text-center font-mono text-sm text-muted">
        no decisions recorded yet
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-start gap-3 rounded-lg border border-panel-border bg-panel/60 px-4 py-3"
        >
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${HISTORY_DOT[entry.kind]}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200">
              {entry.action}
              <span className="text-muted"> — {entry.item}</span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted">{entry.detail}</p>
          </div>
          <time className="font-mono text-[11px] text-muted">{entry.at}</time>
        </li>
      ))}
    </ul>
  );
}
