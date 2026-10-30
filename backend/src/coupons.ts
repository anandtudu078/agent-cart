/**
 * Coupons the agent knows about. Applied to cart entries at checkout.
 *
 * shortcut: 5 hardcoded codes scoped to the seeded retailers — upgrade to a
 * `coupons` collection (agent-discovered, expiry dates) once coupons come
 * from somewhere other than this list.
 */
export interface Coupon {
  code: string;
  /** null = valid at any retailer */
  retailer: string | null;
  kind: "percent" | "amount";
  value: number;
}

const COUPONS: Coupon[] = [
  { code: "SAVE10", retailer: null, kind: "percent", value: 10 },
  { code: "WELCOME5", retailer: null, kind: "amount", value: 5 },
  { code: "AMAZON15", retailer: "Amazon", kind: "percent", value: 15 },
  { code: "KEYCHRON10", retailer: "Keychron", kind: "percent", value: 10 },
  { code: "BESTBUY25", retailer: "Best Buy", kind: "amount", value: 25 },
];

/** All coupons, optionally narrowed to one retailer. */
export function listCoupons(retailer?: string): Coupon[] {
  if (!retailer) return COUPONS;
  const needle = retailer.trim().toLowerCase();
  return COUPONS.filter(
    (coupon) =>
      coupon.retailer === null ||
      coupon.retailer.toLowerCase() === needle,
  );
}

/** Case-insensitive lookup for `code` usable at `retailer`. */
export function findCoupon(code: string, retailer: string): Coupon | null {
  const wanted = code.trim().toLowerCase();
  return (
    listCoupons(retailer).find((coupon) => coupon.code.toLowerCase() === wanted) ??
    null
  );
}

/**
 * The code worth applying at `retailer` for `price`: the one that saves the
 * most. Null when nothing beats zero — a code that does nothing is noise on
 * the receipt.
 *
 * shortcut: only one coupon per cart entry is supported (the schema stores a
 * single `couponCode`), so this picks a winner rather than a combination —
 * lift the limit first if coupons ever stack.
 */
export function bestCoupon(retailer: string, price: number): Coupon | null {
  let best: Coupon | null = null;
  let bestDiscount = 0;
  for (const coupon of listCoupons(retailer)) {
    const discount = couponDiscount(coupon, price);
    if (discount > bestDiscount) {
      best = coupon;
      bestDiscount = discount;
    }
  }
  return best;
}

/** Dollar discount for `coupon` against `price`, floored at 0. */
export function couponDiscount(coupon: Coupon, price: number): number {
  const raw =
    coupon.kind === "percent" ? (price * coupon.value) / 100 : coupon.value;
  return Math.max(0, Math.round(Math.min(raw, price) * 100) / 100);
}
