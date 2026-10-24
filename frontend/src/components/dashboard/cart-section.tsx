"use client";

import { useState } from "react";
import { CreditCard, ShoppingCart, Ticket, Trash2, X } from "lucide-react";
import { useCart } from "@/lib/use-cart";

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
  } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [couponDraft, setCouponDraft] = useState<Record<string, string>>({});

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
