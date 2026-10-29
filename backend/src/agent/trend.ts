export type TrendVerdict = "rising" | "falling" | "flat" | "insufficient";

export interface Trend {
  verdict: TrendVerdict;
  /** % change of the newer half of the series vs the older half (1 decimal). */
  changePct: number;
}

export const INSUFFICIENT: Trend = { verdict: "insufficient", changePct: 0 };

// shortcut: two-half median comparison with a ±1% dead band — a badge, not a
// forecast; upgrade to a least-squares slope when a series spanning weeks
// makes the half-split too jumpy
const DEAD_BAND_PCT = 1;

/** Median of a list; a single spike can't drag it the way a mean would. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * "Buy now or wait" signal from an observed price series (oldest first).
 *
 * Splits the series in half and compares the median of each half, so the
 * verdict reflects the level most points sat at rather than one outlier
 * scrape. Fewer than 4 usable points is not enough history to call either way.
 */
export function trendFor(prices: readonly number[]): Trend {
  const pts = prices.filter((p) => Number.isFinite(p));
  if (pts.length < 4) return INSUFFICIENT;

  const mid = Math.floor(pts.length / 2);
  const oldMedian = median(pts.slice(0, mid));
  if (oldMedian <= 0) return INSUFFICIENT; // free items have no trend to read

  const changePct =
    Math.round(((median(pts.slice(mid)) - oldMedian) / oldMedian) * 1000) / 10;

  const verdict: TrendVerdict =
    changePct > DEAD_BAND_PCT
      ? "rising"
      : changePct < -DEAD_BAND_PCT
        ? "falling"
        : "flat";
  return { verdict, changePct };
}
