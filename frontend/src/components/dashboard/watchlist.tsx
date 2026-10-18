"use client";

import { useWatchItems } from "@/lib/use-watch-items";

/** Watchlist table backed by GET /api/watch-items (replaces mock data). */
export function Watchlist() {
  const { items, loading } = useWatchItems();

  if (loading) {
    return (
      <div className="rounded-xl border border-panel-border bg-panel/60 p-8 text-center font-mono text-sm text-muted">
        loading watchlist…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-panel-border bg-panel/60 p-8 text-center font-mono text-sm text-muted">
        no watch items yet — seed demo data with <code>npm run seed</code>
      </div>
    );
  }

  return (
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
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-panel-border/60 last:border-0 transition-colors hover:bg-white/[0.03]"
            >
              <td className="px-4 py-3">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden>{item.emoji}</span>
                  <span className="text-zinc-200">{item.title}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-muted">{item.retailer}</td>
              <td className="px-4 py-3 text-right font-mono">
                ${item.price.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-muted">
                ${item.target.toFixed(2)}
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
                <span className="rounded-full border border-panel-border px-2 py-0.5 text-[11px] capitalize text-zinc-300">
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-[11px] text-muted">
                {item.updated}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
