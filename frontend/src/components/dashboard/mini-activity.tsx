"use client";

import { useActivityFeed } from "@/lib/use-activity-feed";

const TONE = {
  info: "text-zinc-500",
  ok: "text-emerald-400",
  warn: "text-amber-400",
  buy: "text-fuchsia-400",
} as const;

const MAX = 3;

/** Compact live feed for the sidebar (last 3 lines of the SSE stream). */
export function MiniActivity() {
  const { lines, connected } = useActivityFeed();

  if (lines.length === 0) {
    return (
      <p className="font-mono text-[11px] text-muted/70">
        {connected ? "listening…" : "connecting…"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {lines.slice(-MAX).reverse().map((line) => (
        <p
          key={line.id}
          className="truncate font-mono text-[11px] leading-snug"
          title={line.message}
        >
          <span className="text-zinc-600">{line.time.slice(0, 5)}</span>{" "}
          <span className={TONE[line.level]}>{line.message}</span>
        </p>
      ))}
    </div>
  );
}