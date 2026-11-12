"use client";

import { Fragment, useState } from "react";
import {
  LineChart as ChartIcon,
  Pause,
  Play,
  Search,
  ShoppingCart,
  Trash2,
  Zap,
} from "lucide-react";
import { useCart } from "@/lib/use-cart";
import {
  useWatchItems,
  type FetchStatus,
  type PriceRange,
  type Trend,
} from "@/lib/use-watch-items";
import { AddWatchItemForm } from "./add-watch-item-form";
import { CommandBar } from "./command-bar";
import { PriceChart } from "./price-chart";
import { formatPrice } from "@/lib/use-settings";

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

/** Sold-out badge — only shown when a live fetch actually said so. */
function StockChip({ inStock }: { inStock: boolean }) {
  if (inStock) return null;
  return (
    <span
      title="The product page reported this item out of stock — auto-buy stays off until it is back"
      className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-400"
    >
      sold out
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

/** How today's price compares with the lowest the agent has seen. */
function RangeChip({ range }: { range: PriceRange | null }) {
  if (!range) return null;
  const atLow = range.aboveLowPct <= 1;
  return (
    <span
      title={`Lowest observed ${formatPrice(range.low)} · highest ${formatPrice(
        range.high,
      )} across ${range.points} scans`}
      className={`rounded-full border px-2 py-0.5 text-[11px] ${
        atLow
          ? "border-emerald-500/40 text-emerald-400"
          : "border-panel-border text-muted"
      }`}
    >
      {atLow ? "at low" : `+${range.aboveLowPct.toFixed(1)}% over low`}
    </span>
  );
}

/** Watchlist table backed by GET /api/watch-items (replaces mock data). */
export function Watchlist() {
  const { items, loading, add, remove, setItem, setMany, removeMany, refresh } =
    useWatchItems();
  const cart = useCart();
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  // id of the item whose price chart row is open (null = all collapsed)
  const [chartId, setChartId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "watching" | "drop" | "paused"
  >("all");
  const [sortBy, setSortBy] = useState<
    "recent" | "price-asc" | "price-desc" | "target-gap" | "drop"
  >("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

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
        <CommandBar onExecuted={refresh} />
        <AddWatchItemForm onAdd={add} />
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const visible = items
    .filter((item) => statusFilter === "all" || item.status === statusFilter)
    .filter(
      (item) =>
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.retailer.toLowerCase().includes(needle),
    );
  // filter() already returned a fresh array, so sorting in place is safe
  if (sortBy === "price-asc") visible.sort((a, b) => a.price - b.price);
  if (sortBy === "price-desc") visible.sort((a, b) => b.price - a.price);
  if (sortBy === "target-gap")
    visible.sort((a, b) => a.price - a.target - (b.price - b.target));
  if (sortBy === "drop") visible.sort((a, b) => a.deltaPct - b.deltaPct);

  const allVisibleSelected =
    visible.length > 0 && visible.every((item) => selected.has(item.id));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((item) => next.delete(item.id));
      else visible.forEach((item) => next.add(item.id));
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetView() {
    setQuery("");
    setStatusFilter("all");
    setSortBy("recent");
  }

  async function runBulk(action: "watching" | "paused" | "delete") {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Stop watching ${ids.length} item${ids.length === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    setBulkNotice(null);
    const error =
      action === "delete"
        ? await removeMany(ids)
        : await setMany(ids, { status: action });
    if (error) {
      setBulkNotice(error);
      return;
    }
    setSelected(new Set());
    setBulkNotice(
      action === "delete"
        ? `removed ${ids.length} item${ids.length === 1 ? "" : "s"}`
        : `updated ${ids.length} item${ids.length === 1 ? "" : "s"}`,
    );
  }

  return (
    <>
      <CommandBar onExecuted={refresh} />
      <AddWatchItemForm onAdd={add} />
      {cartNotice && (
        <p className="mb-2 text-xs text-amber-400">{cartNotice}</p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-44 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search title or retailer"
            aria-label="Search watchlist"
            className="w-full rounded-md border border-panel-border bg-[#0c0c12] py-2 pl-8 pr-3 text-sm text-zinc-200 placeholder:text-muted focus:border-cyan-500/50 focus:outline-none"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as typeof statusFilter)
          }
          aria-label="Filter by status"
          className="rounded-md border border-panel-border bg-[#0c0c12] px-2 py-2 text-xs text-zinc-200 focus:border-cyan-500/50 focus:outline-none"
        >
          <option value="all">all statuses</option>
          <option value="watching">watching</option>
          <option value="drop">drop found</option>
          <option value="paused">paused</option>
        </select>
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
          aria-label="Sort watchlist"
          className="rounded-md border border-panel-border bg-[#0c0c12] px-2 py-2 text-xs text-zinc-200 focus:border-cyan-500/50 focus:outline-none"
        >
          <option value="recent">newest first</option>
          <option value="price-asc">price: low → high</option>
          <option value="price-desc">price: high → low</option>
          <option value="target-gap">closest to target</option>
          <option value="drop">biggest 24h drop</option>
        </select>
        {(query !== "" || statusFilter !== "all" || sortBy !== "recent") && (
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-panel-border px-2 py-2 text-xs text-muted transition-colors hover:text-zinc-200"
          >
            reset
          </button>
        )}
      </div>
      {bulkNotice && (
        <p className="mb-2 text-xs text-cyan-400">{bulkNotice}</p>
      )}
      {selected.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.06] px-3 py-2 text-xs">
          <span className="font-mono text-cyan-300">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => void runBulk("watching")}
            className="rounded border border-panel-border px-2 py-1 text-zinc-300 transition-colors hover:bg-white/5"
          >
            resume
          </button>
          <button
            type="button"
            onClick={() => void runBulk("paused")}
            className="rounded border border-panel-border px-2 py-1 text-zinc-300 transition-colors hover:bg-white/5"
          >
            pause
          </button>
          <button
            type="button"
            onClick={() => void runBulk("delete")}
            className="rounded border border-red-500/40 px-2 py-1 text-red-400 transition-colors hover:bg-red-500/10"
          >
            delete
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-muted transition-colors hover:text-zinc-200"
          >
            clear
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-panel-border bg-panel/60">
      {visible.length === 0 ? (
        <div className="p-8 text-center font-mono text-sm text-muted">
          no items match these filters —{" "}
          <button
            type="button"
            onClick={resetView}
            className="text-cyan-400 underline-offset-2 hover:underline"
          >
            reset them
          </button>
        </div>
      ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-panel-border text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="w-10 px-4 py-3 font-medium">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                aria-label="Select all visible items"
                className="h-3.5 w-3.5 accent-cyan-500"
              />
            </th>
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
          {visible.map((item) => (
            <Fragment key={item.id}>
            <tr
              className="border-b border-panel-border/60 transition-colors hover:bg-white/[0.03]"
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  aria-label={`Select ${item.title}`}
                  className="h-3.5 w-3.5 accent-cyan-500"
                />
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden>{item.emoji}</span>
                  <span className="text-zinc-200">{item.title}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-muted">
                <span className="flex items-center gap-1.5">
                  {item.retailer}
                  {item.offers.length > 1 && (
                    <span
                      title={item.offers
                        .slice()
                        .sort((a, b) => a.price - b.price)
                        .map(
                          (offer) =>
                            `${offer.retailer} ${formatPrice(offer.price)}`,
                        )
                        .join("  ·  ")}
                      className="rounded-full border border-cyan-500/40 px-1.5 py-0.5 text-[10px] text-cyan-400"
                    >
                      {item.offers.length} offers
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatPrice(item.price)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-muted">
                {formatPrice(item.target)}
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
                <StockChip inStock={item.inStock} />
                <TrendChip trend={item.trend} />
                <RangeChip range={item.range} />
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
                <td colSpan={9} className="px-4 py-3">
                  <PriceChart itemId={item.id} title={item.title} target={item.target} />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
      )}
      </div>
    </>
  );
}
