"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";

export interface UserSettings {
  priceAlerts: boolean;
  /** Empty = in-app only; otherwise the agent POSTs drops to this URL. */
  webhookUrl: string;
  /** Empty = no email alerts; otherwise drops + the daily digest go here. */
  alertEmail: string;
  /** USD/day auto-buy budget; 0 = no cap. */
  autoBuyDailyCap: number;
  /** Hold every auto-buy until the user confirms it manually. */
  confirmBeforeBuy: boolean;
}

const DEFAULTS: UserSettings = {
  priceAlerts: true,
  webhookUrl: "",
  alertEmail: "",
  autoBuyDailyCap: 0,
  confirmBeforeBuy: false,
};

// shortcut: module-level cache so the sidebar, watchlist, and toasts share
// one fetch — upgrade to a context when more consumers appear
let cached: UserSettings | null = null;
const listeners = new Set<(settings: UserSettings) => void>();

function publish(settings: UserSettings) {
  cached = settings;
  listeners.forEach((fn) => fn(settings));
}

async function loadSettings(): Promise<UserSettings> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/settings`, {
      credentials: "include",
    });
    if (!res.ok) return DEFAULTS;
    const data = (await res.json()) as { settings?: Partial<UserSettings> };
    return { ...DEFAULTS, ...data.settings };
  } catch {
    return DEFAULTS;
  }
}

/** Shared user settings (notifications, guardrails) with a tiny cache. */
export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(cached ?? DEFAULTS);
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    void loadSettings().then((data) => {
      if (!alive) return;
      publish(data);
      setLoading(false);
    });
    const onChange = (next: UserSettings) => setSettings(next);
    listeners.add(onChange);
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);

  /** PATCH the settings; returns an error message or null on success. */
  const save = useCallback(
    async (patch: Partial<UserSettings>): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          return data?.error ?? "could not save settings";
        }
        const data = (await res.json()) as { settings?: Partial<UserSettings> };
        publish({ ...DEFAULTS, ...data.settings });
        return null;
      } catch {
        return "Could not reach the API (http://localhost:4000)";
      }
    },
    [],
  );

  /** Drop the cache after logout so the next user loads fresh settings. */
  const reset = useCallback(() => {
    cached = null;
    publish(DEFAULTS);
  }, []);

  return { settings, loading, save, reset };
}

/**
 * Format an amount in USD — the only currency prices are stored and settled in
 * (PayPal and the Nano leg both quote USD).
 *
 * shortcut: USD-only display; add a cached FX layer before exposing a currency
 * picker again — a symbol swap without conversion shows a euro price that is
 * really dollars.
 */
export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
