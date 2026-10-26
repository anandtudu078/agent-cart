"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { NewWatchItem } from "@/lib/use-watch-items";

interface Props {
  onAdd: (input: NewWatchItem) => Promise<string | null>;
}

/** Collapsible "+ New watch" form above the watchlist table. */
export function AddWatchItemForm({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [retailer, setRetailer] = useState("");
  const [price, setPrice] = useState("");
  const [target, setTarget] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onAdd({
      title: title.trim(),
      retailer: retailer.trim(),
      price: Number(price),
      targetPrice: Number(target),
      url: url.trim() || undefined,
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
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder="https://www.amazon.com/dp/…"
        />
      </label>
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
