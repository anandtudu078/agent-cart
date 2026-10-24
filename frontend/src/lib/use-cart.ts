"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";

export interface CartEntry {
  id: string;
  watchItemId: string;
  itemTitle: string;
  retailer: string;
  emoji: string;
  price: number;
  couponCode?: string | null;
  couponDiscount?: number;
  paypalOrderId?: string | null;
}

interface RawEntry {
  _id: string;
  watchItem: string;
  itemTitle: string;
  retailer: string;
  emoji?: string;
  price: number;
  couponCode?: string;
  couponDiscount?: number;
  status: "reserved" | "checked_out";
  paypalOrderId?: string;
}

function mapEntry(raw: RawEntry): CartEntry {
  return {
    id: raw._id,
    watchItemId: raw.watchItem,
    itemTitle: raw.itemTitle,
    retailer: raw.retailer,
    emoji: raw.emoji ?? "🛍️",
    price: raw.price,
    couponCode: raw.couponCode,
    couponDiscount: raw.couponDiscount ?? 0,
    paypalOrderId: raw.paypalOrderId,
  };
}

// shortcut: 15s polling like the other hooks — revisit with push updates
const POLL_MS = 15_000;

/** Reserved cart items + reserve/release/coupon/checkout mutations. */
export function useCart() {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/cart`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: {
        entries?: RawEntry[];
        subtotal?: number;
        discount?: number;
        total?: number;
      } | null) => {
        setEntries((data?.entries ?? []).map(mapEntry));
        setSubtotal(data?.subtotal ?? 0);
        setDiscount(data?.discount ?? 0);
        setTotal(data?.total ?? 0);
      })
      .catch(() => {
        setEntries([]);
        setSubtotal(0);
        setDiscount(0);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  /** Reserve a watch item; returns an error message or null on success. */
  const add = useCallback(
    async (watchItemId: string): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/api/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ watchItemId }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          return data?.error ?? "Could not reserve the item";
        }
        refresh();
        return null;
      } catch {
        return "Could not reach the API (http://localhost:4000)";
      }
    },
    [refresh],
  );

  /** Release a reserved item. */
  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE}/api/cart/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) {
          refresh();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [refresh],
  );

  /** Apply a coupon code to a reserved entry; error message or null. */
  const applyCoupon = useCallback(
    async (id: string, code: string): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/api/cart/${id}/coupon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          return data?.error ?? "Could not apply the coupon";
        }
        refresh();
        return null;
      } catch {
        return "Could not reach the API (http://localhost:4000)";
      }
    },
    [refresh],
  );

  /** Remove the coupon from a reserved entry. */
  const removeCoupon = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE}/api/cart/${id}/coupon`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) {
          refresh();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [refresh],
  );

  /** Create a PayPal order for a reserved entry. */
  const checkout = useCallback(
    async (
      id: string,
    ): Promise<{ approvalUrl?: string; error: string | null }> => {
      try {
        const res = await fetch(`${API_BASE}/api/cart/${id}/checkout`, {
          method: "POST",
          credentials: "include",
        });
        const data = (await res.json().catch(() => null)) as {
          approvalUrl?: string;
          error?: string;
        } | null;
        if (!res.ok) {
          return { error: data?.error ?? "Checkout failed" };
        }
        refresh();
        return { approvalUrl: data?.approvalUrl, error: null };
      } catch {
        return { error: "Could not reach the API (http://localhost:4000)" };
      }
    },
    [refresh],
  );

  /** Capture an approved PayPal order. */
  const capture = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/api/cart/${id}/capture`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          return data?.error ?? "Capture failed";
        }
        refresh();
        return null;
      } catch {
        return "Could not reach the API (http://localhost:4000)";
      }
    },
    [refresh],
  );

  return {
    entries,
    subtotal,
    discount,
    total,
    loading,
    refresh,
    add,
    remove,
    applyCoupon,
    removeCoupon,
    checkout,
    capture,
  };
}
