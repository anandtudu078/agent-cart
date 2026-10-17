"use client";

import { useEffect, useRef, useState } from "react";

interface MiniLine {
  id: number;
  time: string;
  message: string;
  tone: "ok" | "warn" | "buy" | "info";
}

const TONE: Record<MiniLine["tone"], string> = {
  info: "text-zinc-500",
  ok: "text-emerald-400",
  warn: "text-amber-400",
  buy: "text-fuchsia-400",
};

const QUEUE: Array<Omit<MiniLine, "id" | "time">> = [
  { tone: "ok", message: "drop: XM5 → $328.00" },
  { tone: "info", message: "scan bestbuy 200 · 688ms" },
  { tone: "buy", message: "cart held: Q1 Pro" },
  { tone: "warn", message: "walmart backoff 2s" },
  { tone: "ok", message: "coupon TARGET10 −$19" },
  { tone: "info", message: "next cycle in 30s" },
];

const SEED: MiniLine[] = [
  { id: 0, time: "10:42:18", tone: "ok", message: "drop: XM5 → $328.00" },
  { id: 1, time: "10:41:56", tone: "info", message: "cycle #128 · 5 items" },
];

const MAX = 3;

export function MiniActivity() {
  const [lines, setLines] = useState<MiniLine[]>(SEED);
  const nextId = useRef(SEED.length);
  const cursor = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const template = QUEUE[cursor.current % QUEUE.length];
      cursor.current += 1;
      const time = new Date().toLocaleTimeString("en-US", { hour12: false });
      setLines((prev) => {
        const next = [...prev, { ...template, id: nextId.current++, time }];
        return next.length > MAX ? next.slice(next.length - MAX) : next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line) => (
        <p
          key={line.id}
          className="truncate font-mono text-[11px] leading-snug"
          title={line.message}
        >
          <span className="text-zinc-600">{line.time.slice(0, 5)}</span>{" "}
          <span className={TONE[line.tone]}>{line.message}</span>
        </p>
      ))}
    </div>
  );
}