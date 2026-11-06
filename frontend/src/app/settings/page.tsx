"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Mail, ShieldCheck, Trash2, Webhook } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useSettings } from "@/lib/use-settings";

/** Account settings: notifications, alert targets, guardrails, delete account. */
export default function SettingsPage() {
  const { settings, save } = useSettings();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // null = no edit yet, so the field mirrors the stored value until typing
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);
  const webhookUrl = webhookDraft ?? settings.webhookUrl;
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const alertEmail = emailDraft ?? settings.alertEmail;
  const [capDraft, setCapDraft] = useState<string | null>(null);
  const autoBuyDailyCap = capDraft ?? String(settings.autoBuyDailyCap);
  const router = useRouter();

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    const next = alertEmail.trim();
    const err = await save({ alertEmail: next });
    setNotice(
      err ??
        (next
          ? `Email alerts on — drops and the daily digest go to ${next}.`
          : "Email alerts off — alerts stay in the app."),
    );
    if (!err) setEmailDraft(null);
  }

  async function saveCap(event: React.FormEvent) {
    event.preventDefault();
    if (!autoBuyDailyCap.trim()) {
      setNotice("Daily cap must be a number of 0 or more (0 = no cap).");
      return;
    }
    const cap = Number(autoBuyDailyCap);
    if (!Number.isFinite(cap) || cap < 0) {
      setNotice("Daily cap must be a number of 0 or more (0 = no cap).");
      return;
    }
    const err = await save({ autoBuyDailyCap: cap });
    setNotice(
      err ??
        (cap > 0
          ? `Daily auto-buy cap set to $${cap.toFixed(2)}.`
          : "Daily auto-buy cap cleared — no limit."),
    );
    if (!err) setCapDraft(null);
  }

  async function saveWebhook(event: React.FormEvent) {
    event.preventDefault();
    const next = webhookUrl.trim();
    const err = await save({ webhookUrl: next });
    setNotice(
      err ??
        (next
          ? "Webhook saved — the agent POSTs price drops there."
          : "Webhook cleared — alerts stay in the app."),
    );
    if (!err) setWebhookDraft(null);
  }

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

      {/* Webhook alerts */}
      <section className="rounded-xl border border-panel-border bg-panel/60 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Webhook className="h-4 w-4 text-cyan-400" aria-hidden />
          Webhook alerts
        </h2>
        <p className="mt-1 text-xs text-muted">
          The agent POSTs a JSON payload here the moment an item hits its
          target price — works with a Discord or Slack incoming webhook, or
          any endpoint that accepts JSON. Leave empty to keep alerts in-app.
        </p>
        <form
          onSubmit={(event) => void saveWebhook(event)}
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <input
            type="url"
            value={webhookUrl}
            onChange={(event) => setWebhookDraft(event.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            aria-label="Price-drop webhook URL"
            className="min-w-0 flex-1 rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-cyan-500/40 px-4 py-2 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/10 disabled:opacity-60"
          >
            Save webhook
          </button>
        </form>
      </section>

      {/* Auto-buy guardrails */}
      <section className="rounded-xl border border-panel-border bg-panel/60 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-cyan-400" aria-hidden />
          Auto-buy guardrails
        </h2>
        <p className="mt-1 text-xs text-muted">
          Limits on what the agent may pull into the cart on its own when a
          target is hit. A held buy shows up in History — you can still reserve
          the item from the watchlist by hand.
        </p>
        <form onSubmit={saveCap} className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted">
            Daily cap ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={autoBuyDailyCap}
              onChange={(e) => setCapDraft(e.target.value)}
              aria-label="Daily auto-buy cap in dollars"
              className="mt-1.5 w-32 rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-cyan-500/40 px-4 py-2 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/10"
          >
            Save cap
          </button>
          <span className="text-[11px] text-muted">0 = no cap</span>
        </form>
        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.confirmBeforeBuy}
            onChange={(e) => {
              const on = e.target.checked;
              void save({ confirmBeforeBuy: on }).then((err) =>
                setNotice(
                  err ??
                    (on
                      ? "Confirm-before-buy on — the agent holds every drop for you."
                      : "Confirm-before-buy off — auto-buy runs on its own again."),
                ),
              );
            }}
            className="h-4 w-4 accent-cyan-500"
          />
          Confirm before buying (hold every auto-buy)
        </label>
      </section>

      {/* Email alerts */}
      <section className="rounded-xl border border-panel-border bg-panel/60 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-cyan-400" aria-hidden />
          Email alerts
        </h2>
        <p className="mt-1 text-xs text-muted">
          The agent emails you the moment an item hits its target, plus a daily
          digest of everything it found. Needs the API&apos;s
          <code className="mx-1 rounded bg-panel px-1 py-0.5 text-[11px]">RESEND_API_KEY</code>
          to be set.
        </p>
        <form onSubmit={saveEmail} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={alertEmail}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="you@example.com"
            aria-label="Alert email address"
            className="min-w-0 flex-1 rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          />
          <button
            type="submit"
            className="rounded-md border border-cyan-500/40 px-4 py-2 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/10"
          >
            Save email
          </button>
        </form>
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
