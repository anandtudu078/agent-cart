"use client";

import { useState } from "react";
import { Download, Plus } from "lucide-react";
import type { NewWatchItem } from "@/lib/use-watch-items";
import { API_BASE } from "@/lib/api";

interface Props {
  onAdd: (input: NewWatchItem) => Promise<string | null>;
}

// matches MAX_OFFERS on the API — one product, at most this many retailers
const MAX_RETAILERS = 5;

interface ExtraRetailer {
  retailer: string;
  price: string;
  url: string;
}

/** Collapsible "+ New watch" form above the watchlist table. */
export function AddWatchItemForm({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [retailer, setRetailer] = useState("");
  const [price, setPrice] = useState("");
  const [target, setTarget] = useState("");
  const [url, setUrl] = useState("");
  // extra retailers beyond the primary one above; non-empty → the item is
  // sent as a comparison and priced off the cheapest offer
  const [extra, setExtra] = useState<ExtraRetailer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);

  /** Fill title/retailer/price from the pasted URL (POST .../resolve). */
  async function resolveUrl() {
    if (!url.trim()) {
      setError("paste a product URL first");
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/watch-items/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        title?: string;
        price?: number;
        retailer?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "could not read that page");
        return;
      }
      if (data?.title) setTitle(data.title);
      if (data?.retailer) setRetailer(data.retailer);
      if (typeof data?.price === "number") setPrice(String(data.price));
      if (data?.title === undefined && typeof data?.price !== "number") {
        setError("page had no title or price — fill the rest in manually");
      }
    } catch {
      setError("Could not reach the API (http://localhost:4000)");
    } finally {
      setResolving(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const filled = extra.filter((row) => row.retailer.trim() || row.price.trim());
    if (filled.some((row) => !row.retailer.trim() || row.price.trim() === "")) {
      setBusy(false);
      setError("every retailer needs a name and a price");
      return;
    }
    const err = await onAdd({
      title: title.trim(),
      retailer: retailer.trim(),
      price: Number(price),
      targetPrice: Number(target),
      url: url.trim() || undefined,
      offers:
        filled.length > 0
          ? [
              {
                retailer: retailer.trim(),
                price: Number(price),
                url: url.trim() || undefined,
              },
              ...filled.map((row) => ({
                retailer: row.retailer.trim(),
                price: Number(row.price),
                url: row.url.trim() || undefined,
              })),
            ]
          : undefined,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setTitle("");
    setRetailer("");
    setPrice("");
    setTarget("");
    setUrl("");
    setExtra([]);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 flex items-center gap-1.5 rounded-md border border-panel-border bg-panel/60 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-cyan-500/40 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
        New watch
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-panel-border bg-panel/60 p-4"
    >
      <label className="min-w-44 flex-1 text-xs text-muted">
        Item
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder="Sony WH-1000XM5"
        />
      </label>
      <label className="min-w-32 text-xs text-muted">
        Retailer
        <input
          required
          value={retailer}
          onChange={(e) => setRetailer(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder="Amazon"
        />
      </label>
      <label className="w-28 text-xs text-muted">
        Price ($)
        <input
          required
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder="328.00"
        />
      </label>
      <label className="w-28 text-xs text-muted">
        Target ($)
        <input
          required
          type="number"
          min="0"
          step="0.01"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder="300.00"
        />
      </label>
      <label className="min-w-52 flex-[2] text-xs text-muted">
        Product URL (optional — enables live prices)
        <span className="mt-1.5 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder="https://www.amazon.com/dp/…"
        />
        <button
          type="button"
          disabled={resolving}
          onClick={() => void resolveUrl()}
          title="Read the title, price and retailer from that page"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-panel-border px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-cyan-500/40 hover:text-white disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {resolving ? "Reading…" : "Fetch"}
        </button>
        </span>
      </label>
      <div className="w-full border-t border-panel-border pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-muted">
            Other retailers — the cheapest offer wins
          </p>
          <button
            type="button"
            disabled={1 + extra.length >= MAX_RETAILERS}
            onClick={() =>
              setExtra((rows) => [...rows, { retailer: "", price: "", url: "" }])
            }
            className="flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
          >
            <Plus className="h-3 w-3" aria-hidden />
            Add retailer
          </button>
        </div>
        {extra.length > 0 && (
          <div className="mt-2 space-y-2">
            {extra.map((row, index) => (
              <div key={index} className="flex gap-2">
                <input
                  required
                  value={row.retailer}
                  onChange={(e) =>
                    setExtra((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, retailer: e.target.value } : r,
                      ),
                    )
                  }
                  className="min-w-32 flex-1 rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
                  placeholder="BestBuy"
                />
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.price}
                  onChange={(e) =>
                    setExtra((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, price: e.target.value } : r,
                      ),
                    )
                  }
                  className="w-28 rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
                  placeholder="319.00"
                />
                <input
                  type="url"
                  value={row.url}
                  onChange={(e) =>
                    setExtra((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, url: e.target.value } : r,
                      ),
                    )
                  }
                  className="min-w-40 flex-[2] rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
                  placeholder="https://www.bestbuy.com/… (optional)"
                />
                <button
                  type="button"
                  aria-label={`Remove ${row.retailer || "retailer"}`}
                  onClick={() => setExtra((rows) => rows.filter((_, i) => i !== index))}
                  className="rounded-md border border-panel-border px-2.5 text-muted transition-colors hover:border-red-500/40 hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400 disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-panel-border px-3 py-2 text-sm text-muted transition-colors hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="w-full text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
