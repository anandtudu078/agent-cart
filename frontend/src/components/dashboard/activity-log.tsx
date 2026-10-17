"use client";

import { useEffect, useRef, useState } from "react";

interface LogLine {
  id: number;
  time: string;
  level: "info" | "ok" | "warn" | "buy";
  message: string;
}

const SEED: LogLine[] = [
  { id: 0, time: "10:42:18", level: "ok", message: "drop detected: Sony WH-1000XM5 → $328.00" },
  { id: 1, time: "10:42:17", level: "info", message: "GET amazon.com/dp/B09XS7JWHH → 200 (412ms)" },
  { id: 2, time: "10:41:03", level: "info", message: "cycle #128 started — 5 items queued" },
];

const INCOMING: Array<Omit<LogLine, "id" | "time">> = [
  { level: "info", message: "GET bestbuy.com/lcd/unbranded → 200 (688ms)" },
  { level: "ok", message: "price parsed: $899.99 (no change)" },
  { level: "info", message: "target check: LG C4 needs −$100.09" },
  { level: "warn", message: "rate-limit hint on walmart.com — backing off 2s" },
  { level: "ok", message: "coupon probe: TARGET10 valid, −$19.00" },
  { level: "info", message: "GET target.com/p/apple-watch-s10 → 200 (351ms)" },
  { level: "buy", message: "cart held: Keychron Q1 Pro (session #42)" },
  { level: "info", message: "diff motor idle — no target crossed" },
  { level: "ok", message: "cycle finished: 5/5 items, 8.3s, 0 errors" },
  { level: "info", message: "scheduler: next run in 30s" },
];

const LEVEL_STYLE: Record<LogLine["level"], string> = {
  info: "text-zinc-500",
  ok: "text-emerald-400",
  warn: "text-amber-400",
  buy: "text-fuchsia-400",
};

const MAX_LINES = 40;

export function ActivityLog() {
  const [lines, setLines] = useState<LogLine[]>(SEED);
  const nextId = useRef(SEED.length);
  const cursor = useRef(0);
  const scrollBox = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const template = INCOMING[cursor.current % INCOMING.length];
      cursor.current += 1;
      const time = new Date().toLocaleTimeString("en-US", { hour12: false });
      setLines((prev) => {
        const next = [...prev, { ...template, id: nextId.current++, time }];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    }, 3500);

    return () => clearInterval(timer);
  }, []);

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
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          streaming
        </span>
      </div>

      <div
        ref={scrollBox}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed"
      >
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