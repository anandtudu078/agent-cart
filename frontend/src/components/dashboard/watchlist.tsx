"use client";

import { Fragment, useState } from "react";
import {
  LineChart as ChartIcon,
  Pause,
  Play,
  ShoppingCart,
  Trash2,
  Zap,
} from "lucide-react";
import { useCart } from "@/lib/use-cart";
import { useWatchItems, type FetchStatus, type Trend } from "@/lib/use-watch-items";
import { AddWatchItemForm } from "./add-watch-item-form";
import { PriceChart } from "./price-chart";
import { formatPrice, useSettings } from "@/lib/use-settings";

const FETCH_CHIPS: Record<FetchStatus, { label: string; className: string }> = {
  ok: { label: "live", className: "border-emerald-500/40 text-emerald-400" },
  stale: { label: "stale", className: "border-amber-500/40 text-amber-400" },
  error: {
    label: "fetch failed",
    className: "border-red-500/40 text-red-400",
  },
  simulated: {
    label: "simulated",
    className: "border-panel-border text-muted",
  },
};

/** Where this row's price came from; the tooltip carries the fetch error. */
function FetchChip({
  status,
  error,
}: {
  status: FetchStatus;
  error?: string;
}) {
  const chip = FETCH_CHIPS[status];
  const hint =
    status === "simulated"
      ? "No product URL — this price is simulated by the agent"
      : status === "ok"
        ? "Fetched live from the product page on the last scan"
        : (error ?? "Last fetch failed — keeping the last real price");
  return (
    <span
      title={hint}
      className={`rounded-full border px-2 py-0.5 text-[11px] ${chip.className}`}
    >
      {chip.label}
    </span>
  );
}

/** Buy-now-or-wait badge from the item's own price history. */
function TrendChip({ trend }: { trend: Trend }) {
  if (trend.verdict === "insufficient") return null;
  const view = {
    falling: {
      label: "▼ falling",
      className: "border-emerald-500/40 text-emerald-400",
      hint: (p: number) => `Down ${Math.abs(p).toFixed(1)}% over its observed history — prices are easing`,
    },
    rising: {
      label: "▲ rising",
      className: "border-red-500/40 text-red-400",
      hint: (p: number) => `Up ${p.toFixed(1)}% over its observed history — waiting may cost more`,
    },
    flat: {
      label: "→ flat",
      className: "border-panel-border text-muted",
      hint: () => "Price has held steady across its observed history",
    },
  } as const;
  const { label, className, hint } = view[trend.verdict];
  return (
    <span
      title={hint(trend.changePct)}
      className={`rounded-full border px-2 py-0.5 text-[11px] ${className}`}
    >
      {label}
    </span>
  );
}

/** Watchlist table backed by GET /api/watch-items (replaces mock data). */
export function Watchlist() {
  const { items, loading, add, remove, setItem } = useWatchItems();
  const { settings } = useSettings();
  const cart = useCart();
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  // id of the item whose price chart row is open (null = all collapsed)
  const [chartId, setChartId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="rounded-xl border border-panel-border bg-panel/60 p-8 text-center font-mono text-sm text-muted">
        loading watchlist…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="w-full rounded-xl border border-panel-border bg-panel/60 p-8 text-center font-mono text-sm text-muted">
          no watch items yet — add your first one
        </div>
        <AddWatchItemForm onAdd={add} />
      </div>
    );
  }

  return (
    <>
      <AddWatchItemForm onAdd={add} />
      {cartNotice && (
        <p className="mb-2 text-xs text-amber-400">{cartNotice}</p>
      )}
      <div className="overflow-hidden rounded-xl border border-panel-border bg-panel/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-panel-border text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-4 py-3 font-medium">Item</th>
            <th className="px-4 py-3 font-medium">Retailer</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Target</th>
            <th className="px-4 py-3 text-right font-medium">24h</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Updated</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Fragment key={item.id}>
            <tr
              className="border-b border-panel-border/60 transition-colors hover:bg-white/[0.03]"
            >
              <td className="px-4 py-3">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden>{item.emoji}</span>
                  <span className="text-zinc-200">{item.title}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-muted">{item.retailer}</td>
              <td className="px-4 py-3 text-right font-mono">
                {formatPrice(item.price, settings.currency)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-muted">
                {formatPrice(item.target, settings.currency)}
              </td>
              <td
                className={`px-4 py-3 text-right font-mono ${
                  item.deltaPct < 0
                    ? "text-emerald-400"
                    : item.deltaPct > 0
                      ? "text-red-400"
                      : "text-muted"
                }`}
              >
                {item.deltaPct > 0 ? "+" : ""}
                {item.deltaPct.toFixed(1)}%
              </td>
              <td className="px-4 py-3">
                <span className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-panel-border px-2 py-0.5 text-[11px] capitalize text-zinc-300">
                  {item.status}
                </span>
                <FetchChip status={item.fetchStatus} error={item.lastFetchError} />
                <TrendChip trend={item.trend} />
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-[11px] text-muted">
                {item.updated}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  aria-label={`Toggle auto-buy for ${item.title}`}
                  aria-pressed={item.autoBuy}
                  title={
                    item.autoBuy
                      ? "Auto-buy on — pulls the item into the cart when it hits target"
                      : "Auto-buy off — enable to reserve automatically on a drop"
                  }
                  onClick={() => {
                    void setItem(item.id, { autoBuy: !item.autoBuy }).then(
                      (error) => {
                        if (error) setCartNotice(error);
                      },
                    );
                  }}
                  className={`rounded-md p-1.5 transition-colors ${
                    item.autoBuy
                      ? "bg-amber-500/15 text-amber-400"
                      : "text-muted hover:bg-amber-500/10 hover:text-amber-400"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={
                    item.status === "paused"
                      ? `Resume scanning ${item.title}`
                      : `Pause scanning ${item.title}`
                  }
                  onClick={() => {
                    const next =
                      item.status === "paused" ? "watching" : "paused";
                    void setItem(item.id, { status: next });
                  }}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-cyan-500/10 hover:text-cyan-400"
                >
                  {item.status === "paused" ? (
                    <Play className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Pause className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Toggle price history for ${item.title}`}
                  onClick={() => setChartId(chartId === item.id ? null : item.id)}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-cyan-500/10 hover:text-cyan-400"
                >
                  <ChartIcon className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Reserve ${item.title} in the cart`}
                  disabled={cart.entries.some((e) => e.watchItemId === item.id)}
                  onClick={() => {
                    void cart.add(item.id).then((error) => setCartNotice(error));
                  }}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-cyan-500/10 hover:text-cyan-400 disabled:opacity-40"
                >
                  <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Stop watching ${item.title}`}
                  onClick={() => {
                    if (window.confirm(`Stop watching “${item.title}”?`)) {
                      void remove(item.id);
                    }
                  }}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
                </span>
              </td>
            </tr>
            {chartId === item.id && (
              <tr className="border-b border-panel-border/60 last:border-0">
                <td colSpan={8} className="px-4 py-3">
                  <PriceChart itemId={item.id} title={item.title} target={item.target} />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
