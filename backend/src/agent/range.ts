/**
 * Observed price range for one item — the "is this actually cheap?" signal
 * beside the short-term trend. The watchlist route feeds it the true low,
 * high, and point count over every retained price point, while the trend
 * still looks at only the newest window.
 */

export interface PriceRange {
  /** Lowest price ever observed (and the current price). */
  low: number;
  /** Highest price ever observed (and the current price). */
  high: number;
  /** How many observed points the range covers. */
  points: number;
  /** Current price above `low`, in % (1 decimal; 0 = sitting at the low). */
  aboveLowPct: number;
}

export interface ObservedRange {
  low: number;
  high: number;
  points: number;
}

// same bar as the trend signal: four scans is the least that deserves a badge
const MIN_POINTS = 4;

/**
 * Range for `current` over the observed low/high.
 * Returns null until there is enough history to say anything honest.
 */
export function priceRangeFrom(
  observed: ObservedRange,
  current: number,
): PriceRange | null {
  if (!Number.isFinite(current) || current <= 0) return null;
  if (!Number.isFinite(observed.low) || observed.low <= 0) return null;
  if (!Number.isFinite(observed.high) || observed.high <= 0) return null;
  if (!Number.isFinite(observed.points) || observed.points < MIN_POINTS) {
    return null;
  }

  // include the live price so a manual target/price edit can't read negative
  const low = Math.min(observed.low, current);
  const high = Math.max(observed.high, current);
  const aboveLowPct = Math.round(((current - low) / low) * 1000) / 10;
  return { low, high, points: observed.points, aboveLowPct };
}
