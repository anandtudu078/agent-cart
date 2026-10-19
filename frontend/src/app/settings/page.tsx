"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Trash2, Wallet } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useSettings } from "@/lib/use-settings";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY"];

/** Account settings: currency, price-drop notifications, delete account. */
export default function SettingsPage() {
  const { settings, save } = useSettings();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function requestNotifications() {
    if (typeof Notification === "undefined") {
      setNotice("This browser does not support desktop notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setNotice("Notification permission denied — toasts will still appear in the app.");
      return;
    }
    const err = await save({ priceAlerts: true });
    setNotice(err ?? null);
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Delete your account and all your watch items and cart entries? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/account`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setNotice("Could not delete the account — try again.");
        return;
      }
      router.push("/signup");
    } catch {
      setNotice("Could not reach the API (http://localhost:4000)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-mono text-xs text-cyan-400">$ agentcart settings</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Preferences for your account and the price-watch agent.
        </p>
      </div>

      {notice && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
          {notice}
        </p>
      )}

      {/* Currency */}
      <section className="rounded-xl border border-panel-border bg-panel/60 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-cyan-400" aria-hidden />
          Currency
        </h2>
        <p className="mt-1 text-xs text-muted">
          Used for prices shown on your watchlist.
        </p>
        <select
          value={settings.currency}
          onChange={(e) => void save({ currency: e.target.value })}
          aria-label="Display currency"
          className="mt-4 rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </section>

      {/* Notifications */}
      <section className="rounded-xl border border-panel-border bg-panel/60 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-cyan-400" aria-hidden />
          Price-drop notifications
        </h2>
        <p className="mt-1 text-xs text-muted">
          Get a desktop notification whenever the agent finds a drop below
          your target price. In-app toasts always show.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.priceAlerts}
            onChange={(e) => {
              if (e.target.checked) void requestNotifications();
              else void save({ priceAlerts: false });
            }}
            className="h-4 w-4 accent-cyan-500"
          />
          Enable desktop notifications
        </label>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-500/30 bg-panel/60 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-red-400">
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete account
        </h2>
        <p className="mt-1 text-xs text-muted">
          Removes your account, watch items, and cart entries permanently.
        </p>
        <button
          type="button"
          disabled={busy || deleting}
          onClick={() => {
            setDeleting(true);
            void deleteAccount();
          }}
          className="mt-4 rounded-md border border-red-500/40 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </section>
    </div>
  );
}
