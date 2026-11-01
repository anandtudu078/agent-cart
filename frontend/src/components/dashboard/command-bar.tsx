"use client";

import { useState } from "react";
import { CornerDownLeft, Terminal } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface Props {
  /** Called after a command executed, so the watchlist can re-fetch. */
  onExecuted: () => void;
}

interface CommandReply {
  action?: string;
  reply?: string;
  error?: string;
}

/**
 * Plain-language command bar — one line in, one intent out:
 * "watch Sony WH-1000XM5 now $328 under $300, auto-buy" ·
 * "pause Keychron K2" · "set target for Keychron K2 to $79"
 */
export function CommandBar({ onExecuted }: Props) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const command = text.trim();
    if (!command) return;
    setBusy(true);
    setReply(null);
    try {
      const res = await fetch(`${API_BASE}/api/agent/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: command }),
      });
      const data = (await res.json().catch(() => null)) as CommandReply | null;
      // 422 = the agent answered but didn't understand; its reply is the message
      if (!res.ok && res.status !== 422) {
        setReply({
          ok: false,
          message:
            data?.error ?? "Could not reach the API (http://localhost:4000)",
        });
        return;
      }
      setReply({
        ok: res.ok,
        message:
          data?.reply ??
          (res.ok ? "done" : "I didn't understand that command"),
      });
      if (res.ok) {
        setText("");
        onExecuted();
      }
    } catch {
      setReply({ ok: false, message: "Could not reach the API (http://localhost:4000)" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-3">
      <div className="flex items-center gap-2 rounded-xl border border-panel-border bg-panel/60 px-3 py-2 transition-colors focus-within:border-cyan-500/60">
        <Terminal className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          aria-label="Command the agent in plain language"
          placeholder='watch Sony WH-1000XM5 now $328 under $300, auto-buy'
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="flex shrink-0 items-center gap-1 rounded-md border border-panel-border px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
        >
          {busy ? "Running…" : "Run"}
          <CornerDownLeft className="h-3 w-3" aria-hidden />
        </button>
      </div>
      {reply ? (
        <p
          role="status"
          className={`mt-1.5 text-xs ${reply.ok ? "text-emerald-400" : "text-amber-400"}`}
        >
          {reply.message}
        </p>
      ) : (
        <p className="mt-1.5 font-mono text-[11px] text-muted">
          try: “pause Keychron K2” · “set target for Keychron K2 to $79” ·
          “watch … under $300, check every 10 minutes”
        </p>
      )}
    </form>
  );
}
