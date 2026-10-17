"use client";

import { useEffect, useRef } from "react";
import { useActivityFeed } from "@/lib/use-activity-feed";

const LEVEL_STYLE = {
  info: "text-zinc-500",
  ok: "text-emerald-400",
  warn: "text-amber-400",
  buy: "text-fuchsia-400",
} as const;

export function ActivityLog() {
  const { lines, connected } = useActivityFeed();
  const scrollBox = useRef<HTMLDivElement | null>(null);

  // stick to the bottom of this box only — scrollIntoView would also scroll the page
  useEffect(() => {
    const box = scrollBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-panel-border bg-[#0c0c12]">
      <div className="flex items-center gap-2 border-b border-panel-border px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" aria-hidden />
        <p className="ml-2 font-mono text-xs text-muted">
          agent.log — live tail
        </p>
        <span
          className={`ml-auto flex items-center gap-1.5 font-mono text-[11px] ${connected ? "text-emerald-400" : "text-amber-400"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`}
          />
          {connected ? "streaming" : "reconnecting…"}
        </span>
      </div>

      <div
        ref={scrollBox}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed"
      >
        {lines.length === 0 && (
          <p className="text-zinc-600">
            {connected ? "no events yet" : "connecting to agent…"}
          </p>
        )}
        {lines.map((line) => (
          <p key={line.id} className="whitespace-pre-wrap break-words">
            <span className="text-zinc-600">{line.time}</span>{" "}
            <span className={LEVEL_STYLE[line.level]}>
              {line.level.toUpperCase().padEnd(4, " ")}
            </span>{" "}
            <span className="text-zinc-300">{line.message}</span>
          </p>
        ))}
      </div>
    </div>
  );
}