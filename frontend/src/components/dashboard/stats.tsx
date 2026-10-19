"use client";

import {
  Eye,
  History as HistoryIcon,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import { useStats } from "@/lib/use-stats";

const ICONS = {
  eye: Eye,
  trend: TrendingDown,
  bot: HistoryIcon,
  cart: ShoppingCart,
} as const;

type StatDef = {
  label: string;
  value: string;
  hint: string;
  icon: keyof typeof ICONS;
};

/** Four stat cards backed by GET /api/watch-items + GET /api/history. */
export function Stats() {
  const { stats, loading } = useStats();

  const cards: StatDef[] = [
    {
      label: "Active watches",
      value: loading ? "…" : String(stats.active),
      hint: loading
        ? "loading…"
        : stats.nearing > 0
          ? `${stats.nearing} nearing target`
          : "none near target",
      icon: "eye",
    },
    {
      label: "Drops",
      value: loading ? "…" : String(stats.drops),
      hint: loading
        ? "loading…"
        : stats.drops === 0
          ? "no drops flagged"
          : stats.saved > 0
            ? `$${stats.saved.toFixed(0)} below target`
            : "flagged by the agent",
      icon: "trend",
    },
    {
      label: "Decisions",
      value: loading ? "…" : String(stats.decisions),
      hint: loading
        ? "loading…"
        : `${stats.alerts} alerts · ${stats.buys} buys`,
      icon: "bot",
    },
    {
      label: "Cart value",
      value: loading ? "…" : `$${stats.cartTotal.toFixed(0)}`,
      hint: loading
        ? "loading…"
        : stats.cartItems === 0
          ? "nothing reserved"
          : `${stats.cartItems} item${stats.cartItems === 1 ? "" : "s"} reserved`,
      icon: "cart",
    },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((stat) => {
        const Icon = ICONS[stat.icon];
        return (
          <div
            key={stat.label}
            className="rounded-xl border border-panel-border bg-panel/60 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">{stat.label}</p>
              <Icon className="h-4 w-4 text-muted" aria-hidden />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] text-muted/80">{stat.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
