import { env } from "../config/env.js";

export interface PriceUpdate {
  price: number;
  reason?: string;
}

export interface ServiceResult {
  source: string;
  updates: Map<string, PriceUpdate>;
}

// one cycle must never hang on a slow agent service — the caller falls
// back to the local jitter when this fires
const TIMEOUT_MS = 8_000;

// defense in depth: never trust an outside service to move a price more
// than this in one step, even though the service clamps to ±3% itself
const MAX_STEP = 0.25;

/**
 * Ask the Python agent service (agent-service/) for one price decision per
 * item. Returns null on any failure — network, timeout, bad shape — so the
 * scan cycle can silently degrade to its built-in random walk.
 */
export async function fetchPriceUpdates(
  items: {
    id: string;
    title: string;
    retailer: string;
    price: number;
    targetPrice: number;
  }[],
): Promise<ServiceResult | null> {
  try {
    const res = await fetch(`${env.agentServiceUrl}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      source?: unknown;
      updates?: { id?: unknown; price?: unknown; reason?: unknown }[];
    };
    if (!Array.isArray(data.updates)) return null;

    const known = new Map(items.map((item) => [item.id, item.price]));
    const updates = new Map<string, PriceUpdate>();
    for (const update of data.updates) {
      const id = typeof update.id === "string" ? update.id : null;
      const current = id === null ? undefined : known.get(id);
      if (
        id === null ||
        current === undefined ||
        typeof update.price !== "number" ||
        !Number.isFinite(update.price) ||
        update.price < 1 ||
        Math.abs(update.price - current) > current * MAX_STEP
      ) {
        continue; // ignore ids/prices we didn't ask about
      }
      updates.set(id, {
        price: update.price,
        reason: typeof update.reason === "string" ? update.reason : undefined,
      });
    }
    return {
      source: typeof data.source === "string" ? data.source : "agent-service",
      updates,
    };
  } catch {
    return null; // service down or too slow → local jitter
  }
}
