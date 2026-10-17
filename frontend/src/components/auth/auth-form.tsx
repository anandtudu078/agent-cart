"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";

interface Props {
  mode: "login" | "signup";
}

/** Shared email/password form for /login and /signup. */
export function AuthForm({ mode }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong — is the API running?");
        return;
      }
      router.push("/");
    } catch {
      setError("Could not reach the API (http://localhost:4000)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm rounded-xl border border-panel-border bg-panel/60 p-6"
    >
      <p className="font-mono text-xs text-cyan-400">
        $ agentcart {mode} {busy ? "…" : ""}
      </p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">
        {mode === "login" ? "Log in" : "Create your account"}
      </h1>

      <label className="mt-5 block text-xs text-muted">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder="you@example.com"
        />
      </label>

      <label className="mt-3 block text-xs text-muted">
        Password
        <input
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-panel-border bg-[#0c0c12] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
          placeholder={mode === "signup" ? "at least 8 characters" : "••••••••"}
        />
      </label>

      {error && (
        <p className="mt-3 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400 disabled:opacity-60"
      >
        {mode === "login" ? "Log in" : "Sign up"}
      </button>

      <p className="mt-4 text-center text-xs text-muted">
        {mode === "login" ? (
          <>
            No account?{" "}
            <a href="/signup" className="text-cyan-400 hover:text-cyan-300">
              Sign up
            </a>
          </>
        ) : (
          <>
            Already registered?{" "}
            <a href="/login" className="text-cyan-400 hover:text-cyan-300">
              Log in
            </a>
          </>
        )}
      </p>
    </form>
  );
}