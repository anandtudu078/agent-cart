"use client";

import { useEffect } from "react";
import { BellRing } from "lucide-react";
import { useDropAlerts } from "@/lib/use-drop-alerts";
import { useSettings } from "@/lib/use-settings";

const TOAST_MS = 8_000;

/**
 * Global price-drop toasts (bottom-right). Also fires a browser
 * Notification when the user has already granted permission — the
 * settings page is where they grant it.
 */
export function DropToasts() {
  const { toasts, dismiss } = useDropAlerts();
  const { settings } = useSettings();

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          desktopAlerts={settings.priceAlerts}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}

function Toast({
  toast,
  desktopAlerts,
  onDismiss,
}: {
  toast: { id: number; message: string; at: string };
  desktopAlerts: boolean;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    // desktop notification only when enabled in settings AND permitted
    // (the settings page is where permission gets requested)
    if (
      desktopAlerts &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification("AgentCart — price drop 🎉", { body: toast.message });
    }
  }, [toast.id, toast.message, desktopAlerts]);

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-cyan-500/40 bg-panel p-3 shadow-lg shadow-cyan-500/10"
    >
      <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-cyan-400">price drop</p>
        <p className="mt-0.5 text-xs leading-snug text-zinc-200">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-zinc-200"
      >
        ✕
      </button>
    </div>
  );
}
