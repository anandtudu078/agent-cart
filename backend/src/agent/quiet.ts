/**
 * Quiet-hours gate for immediate out-of-app alerts. Pure and UTC-based, so
 * the scan cycle's timing cannot drift with the server's locale.
 */
export interface QuietHours {
  enabled: boolean;
  /** Inclusive start hour, 0–23 UTC. */
  start: number;
  /** Exclusive end hour, 0–23 UTC. May be lower than `start` (overnight). */
  end: number;
}

export function inQuietHours(now: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const { start, end } = quiet;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > 23 ||
    end < 0 ||
    end > 23
  ) {
    return false;
  }
  // same start/end means "no window" — never silence alerts by accident
  if (start === end) return false;
  const hour = now.getUTCHours();
  return start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
}
