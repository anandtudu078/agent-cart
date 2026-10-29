"use client";

import { useEffect, useState } from "react";
import { Coins, Copy, CreditCard, ShoppingCart, Ticket, Trash2, X } from "lucide-react";
import { useCart, type CartEntry } from "@/lib/use-cart";

/** Reserved cart items with coupons + PayPal checkout, backed by /api/cart. */
export function CartSection() {
  const {
    entries,
    subtotal,
    discount,
    total,
    loading,
    remove,
    applyCoupon,
    removeCoupon,
    checkout,
    capture,
    nanoQuote,
    nanoVerify,
  } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [couponDraft, setCouponDraft] = useState<Record<string, string>>({});
  // entry whose Nano payment panel is open, and the block hash typed for it
  const [nanoOpen, setNanoOpen] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);

  // tick only while a panel is open so the expiry countdown stays honest.
  // Date.now() lives here and in the click handler — Next 16 forbids it in
  // render (it would freeze the clock in the prerender) and the lint rules
  // forbid the sync setState, so `now` starts at 0 and the helpers below
  // treat 0 as "clock not started" until the first tick lands
  useEffect(() => {
    if (!nanoOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [nanoOpen]);

  /** Has this entry got a quote the buyer can still pay against? */
  const hasQuote = (entry: CartEntry) =>
    Boolean(entry.nanoAmountRaw && entry.nanoQuoteExpiresAt);
  /** True only once the clock is running and the deadline has passed. */
  const quoteExpired = (entry: CartEntry) =>
    Boolean(
      now &&
        entry.nanoQuoteExpiresAt &&
        new Date(entry.nanoQuoteExpiresAt).getTime() <= now,
    );
  /** m:ss left on a quote, floored at zero; empty until the clock starts. */
  const expiresIn = (entry: CartEntry) => {
    if (!now) return "";
    const left = Math.max(
      0,
      Math.floor(
        (new Date(entry.nanoQuoteExpiresAt ?? 0).getTime() - now) / 1000,
      ),
    );
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  };

  async function runNanoQuote(id: string) {
    setBusyId(id);
    setNotice(null);
    const error = await nanoQuote(id);
    setBusyId(null);
    setNotice(error);
  }

  async function runNanoVerify(entry: CartEntry) {
    const hash = (blockDraft[entry.id] ?? "").trim();
    if (!hash) return;
    setBusyId(entry.id);
    setNotice(null);
    const error = await nanoVerify(entry.id, hash);
    setBusyId(null);
    if (error) {
      setNotice(error);
      return;
    }
    setBlockDraft((draft) => ({ ...draft, [entry.id]: "" }));
    setNanoOpen(null);
    setNotice("Nano payment confirmed — item checked out.");
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setNotice("Nano address copied.");
    } catch {
      setNotice("Could not copy — select the address manually.");
    }
  }

  async function runCheckout(id: string) {
    setBusyId(id);
    setNotice(null);
    const result = await checkout(id);
    setBusyId(null);
    if (result.error) {
      setNotice(result.error);
    } else if (result.approvalUrl) {
      window.open(result.approvalUrl, "_blank", "noopener,noreferrer");
      setNotice("PayPal order created — approve it, then capture it here.");
    } else {
      setNotice("PayPal order created, but no approval URL was returned.");
    }
  }

  async function runApplyCoupon(id: string) {
    const code = (couponDraft[id] ?? "").trim();
    if (!code) return;
    setBusyId(id);
    setNotice(null);
    const error = await applyCoupon(id, code);
    setBusyId(null);
    if (error) {
      setNotice(error);
      return;
    }
    setCouponDraft((draft) => ({ ...draft, [id]: "" }));
    setNotice(`Coupon ${code.toUpperCase()} applied.`);
  }

  async function runRemoveCoupon(id: string) {
    setBusyId(id);
    setNotice(null);
    const ok = await removeCoupon(id);
    setBusyId(null);
    setNotice(ok ? "Coupon removed." : "Could not remove the coupon.");
  }

  async function runCapture(id: string) {
    setBusyId(id);
    setNotice(null);
    const error = await capture(id);
    setBusyId(null);
    setNotice(error ?? "Payment captured — item checked out.");
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-panel-border bg-panel/60 p-8 text-center font-mono text-sm text-muted">
        loading cart…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1 rounded-xl border border-panel-border bg-panel/60 p-8 text-center">
        <p className="font-mono text-sm text-muted">
          cart is empty — reserve an item from the watchlist
        </p>
        {notice && <p className="mt-2 text-xs text-amber-400">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-panel-border bg-panel/60">
      {notice && (
        <p className="border-b border-panel-border px-4 py-2 text-xs text-amber-400">
          {notice}
        </p>
      )}
      <ul>
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center gap-3 border-b border-panel-border/60 px-4 py-3 last:border-0"
          >
            <span aria-hidden>{entry.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-200">
                {entry.itemTitle}
              </p>
              <p className="font-mono text-xs text-muted">{entry.retailer}</p>
            </div>
            <span className="font-mono text-sm">
              {entry.couponDiscount ? (
                <>
                  <span className="text-muted line-through">
                    ${entry.price.toFixed(2)}
                  </span>{" "}
                  <span className="text-emerald-400">
                    ${(entry.price - entry.couponDiscount).toFixed(2)}
                  </span>
                </>
              ) : (
                `$${entry.price.toFixed(2)}`
              )}
            </span>
            {entry.couponCode ? (
              <span className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[11px] text-emerald-400">
                <Ticket className="h-3 w-3" aria-hidden />
                {entry.couponCode} −${(entry.couponDiscount ?? 0).toFixed(2)}
                <button
                  type="button"
                  aria-label={`Remove coupon ${entry.couponCode}`}
                  disabled={busyId === entry.id}
                  onClick={() => void runRemoveCoupon(entry.id)}
                  className="rounded p-0.5 transition-colors hover:text-emerald-200 disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <input
                  value={couponDraft[entry.id] ?? ""}
                  onChange={(e) =>
                    setCouponDraft((draft) => ({
                      ...draft,
                      [entry.id]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runApplyCoupon(entry.id);
                  }}
                  placeholder="coupon code"
                  aria-label={`Coupon code for ${entry.itemTitle}`}
                  className="w-28 rounded-md border border-panel-border bg-[#0c0c12] px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-cyan-500/60"
                />
                <button
                  type="button"
                  disabled={busyId === entry.id || !couponDraft[entry.id]?.trim()}
                  onClick={() => void runApplyCoupon(entry.id)}
                  className="rounded-md border border-panel-border px-2 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-400 disabled:opacity-50"
                >
                  {busyId === entry.id ? "…" : "Apply"}
                </button>
              </span>
            )}
            {entry.paypalOrderId ? (
              <button
                type="button"
                disabled={busyId === entry.id}
                onClick={() => void runCapture(entry.id)}
                className="flex items-center gap-1.5 rounded-md border border-panel-border px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-400/40 hover:text-emerald-400 disabled:opacity-50"
              >
                <CreditCard className="h-3 w-3" aria-hidden />
                {busyId === entry.id ? "working…" : "Capture payment"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busyId === entry.id}
                onClick={() => void runCheckout(entry.id)}
                className="flex items-center gap-1.5 rounded-md border border-panel-border px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-400 disabled:opacity-50"
              >
                <ShoppingCart className="h-3 w-3" aria-hidden />
                {busyId === entry.id ? "working…" : "PayPal checkout"}
              </button>
            )}
            <button
              type="button"
              aria-label={`Pay ${entry.itemTitle} with Nano`}
              aria-expanded={nanoOpen === entry.id}
              disabled={busyId === entry.id}
              onClick={() => {
                if (nanoOpen === entry.id) {
                  setNanoOpen(null);
                  return;
                }
                setNanoOpen(entry.id);
                // opening it with no live quote → request one right away
                // (Date.now() here: an event handler, never render)
                const fresh =
                  hasQuote(entry) &&
                  Date.now() <
                    new Date(entry.nanoQuoteExpiresAt ?? 0).getTime();
                if (!fresh) void runNanoQuote(entry.id);
              }}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                nanoOpen === entry.id
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                  : "border-panel-border text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-400"
              }`}
            >
              <Coins className="h-3 w-3" aria-hidden />
              {busyId === entry.id ? "…" : "Nano"}
            </button>
            <button
              type="button"
              aria-label={`Release ${entry.itemTitle}`}
              onClick={() => {
                if (window.confirm(`Release “${entry.itemTitle}” from the cart?`)) {
                  void remove(entry.id);
                }
              }}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            {nanoOpen === entry.id && (
              <div className="mt-3 w-full rounded-md border border-panel-border bg-[#0c0c12]/70 p-3">
                {!hasQuote(entry) ? (
                  <p className="text-xs text-muted">
                    {busyId === entry.id
                      ? "requesting a quote…"
                      : "no quote yet — press Nano to get one"}
                  </p>
                ) : quoteExpired(entry) ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs text-amber-400">
                      Quote expired — the rate moved. Refresh before sending.
                    </p>
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => void runNanoQuote(entry.id)}
                      className="rounded-md border border-panel-border px-2.5 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
                    >
                      Refresh quote
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted">
                      Send exactly{" "}
                      <span className="font-mono text-cyan-400">
                        {entry.nanoQuotedXno} XNO
                      </span>
                      {entry.nanoRate
                        ? ` (≈ $${(
                            Number(entry.nanoQuotedXno) * entry.nanoRate
                          ).toFixed(2)})`
                        : ""}{" "}
                      from your own wallet — no account, no card, no fee.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="min-w-0 break-all font-mono text-[11px] text-zinc-300">
                        {entry.nanoAddress}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyAddress(entry.nanoAddress ?? "")}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-cyan-500/40 hover:text-white"
                      >
                        <Copy className="h-3 w-3" aria-hidden /> Copy
                      </button>
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-muted">
                      rate ${entry.nanoRate?.toFixed(4)}/XNO · expires in{" "}
                      {expiresIn(entry)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={blockDraft[entry.id] ?? ""}
                        onChange={(e) =>
                          setBlockDraft((draft) => ({
                            ...draft,
                            [entry.id]: e.target.value,
                          }))
                        }
                        placeholder="send block hash (64 hex chars)"
                        aria-label={`Nano block hash for ${entry.itemTitle}`}
                        className="min-w-0 flex-1 rounded-md border border-panel-border bg-[#0c0c12] px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-cyan-500/60"
                      />
                      <button
                        type="button"
                        disabled={
                          busyId === entry.id || !(blockDraft[entry.id] ?? "").trim()
                        }
                        onClick={() => void runNanoVerify(entry)}
                        className="rounded-md border border-cyan-500/40 px-2.5 py-1.5 text-[11px] text-cyan-400 transition-colors hover:bg-cyan-500/10 disabled:opacity-50"
                      >
                        {busyId === entry.id ? "verifying…" : "Verify payment"}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      Your wallet shows the block hash after sending — paste it
                      here and the agent checks subtype, amount and destination
                      against the ledger before the item is checked out.
                    </p>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-panel-border px-4 py-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {entries.length} item{entries.length === 1 ? "" : "s"} reserved
          </span>
          <span className="font-mono">
            subtotal ${subtotal.toFixed(2)}
          </span>
        </div>
        {discount > 0 && (
          <div className="flex items-center justify-between font-mono text-xs text-emerald-400">
            <span>coupons</span>
            <span>−${discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-center justify-between font-mono text-sm text-zinc-200">
          <span>total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
