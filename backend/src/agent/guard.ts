/**
 * Auto-buy guardrails: the two settings that decide whether the scan cycle
 * may reserve a dropped item into the cart on its own.
 *
 * Pure functions on purpose — the cycle owns the database work, these only
 * answer "may this reserve happen, and if not, why".
 */

/**
 * How long a guardrail-held auto-buy stays approvable. The price was frozen
 * when the drop was detected; a day is long enough to act on it and short
 * enough that a stale quote can't be approved weeks later.
 */
export const HELD_BUY_TTL_MS = 24 * 60 * 60 * 1_000;

/** Deadline for a hold created at `now` (defaults to the current time). */
export function heldBuyExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + HELD_BUY_TTL_MS);
}

export interface GuardInput {
  /** User setting: hold every auto-buy for a manual confirmation. */
  confirmBeforeBuy: boolean;
  /** User setting: USD/day auto-buy budget; 0 = no cap. */
  dailyCapUsd: number;
  /** Sum of today's cart totals for this owner (price - coupon discount). */
  spentTodayUsd: number;
  /** The price the entry would be frozen at. */
  price: number;
  /** Coupon discount already priced into the entry. */
  discount: number;
}

/**
 * The reason a reserve must be held, or null when it may proceed.
 *
 * shortcut: caps are USD-only and "today" is UTC — the cart stores USD
 * totals, so a multi-currency cap needs per-currency conversion first.
 */
export function autoBuyHoldReason(input: GuardInput): string | null {
  if (input.confirmBeforeBuy) {
    return "confirm-before-buy is on in your settings";
  }
  if (input.dailyCapUsd > 0) {
    const total = Math.max(0, input.price - input.discount);
    if (input.spentTodayUsd + total > input.dailyCapUsd) {
      return (
        `it would pass your $${input.dailyCapUsd.toFixed(2)} daily auto-buy cap ` +
        `($${input.spentTodayUsd.toFixed(2)} already spent today)`
      );
    }
  }
  return null;
}
