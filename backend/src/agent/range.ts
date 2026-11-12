/**
 * Observed price range for one item — the "is this actually cheap?" signal
 * beside the short-term trend. Pure function; the watchlist route feeds it
 * the same 60 points it already loads for the trend.
 */

export interface PriceRange {
  /** Lowest price seen in the observed window (and the current price). */
  low: number;
  /** Highest price seen in the observed window (and the current price). */
  high: number;
  /** How many observed points the range covers. */
  points: number;
  /** Current price above `low`, in % (1 decimal; 0 = sitting at the low). */
  aboveLowPct: number;
}

// same bar as the trend signal: four scans is the least that deserves a badge
const MIN_POINTS = 4;

/**
 * Range for `current` over `prices` (oldest first).
 * Returns null until there is enough history to say anything honest.
 *
 * shortcut: the window is whatever series the caller passes (the watchlist
 * uses its last 60 points). A true all-time low needs a $min aggregation
 * over the whole collection — upgrade if the 60-point floor misleads.
 */
export function priceRangeFor(
  prices: readonly number[],
  current: number,
): PriceRange | null {
  if (!Number.isFinite(current) || current <= 0) return null;
  const pts = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (pts.length < MIN_POINTS) return null;

  // include the live price so a manual target/price edit can't read negative
  const low = Math.min(...pts, current);
  const high = Math.max(...pts, current);
  const aboveLowPct =
    Math.round(((current - low) / low) * 1000) / 10;
  return { low, high, points: pts.length, aboveLowPct };
}
