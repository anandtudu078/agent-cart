"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useSession } from "@/lib/auth";

/** Sidebar footer: current user + logout, or login/signup links. */
export function AuthFooter() {
  const { user, loading, setUser } = useSession();
  const router = useRouter();

  if (loading) {
    return <p className="truncate font-mono text-[11px] text-muted">checking session…</p>;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <Link href="/login" className="text-cyan-400 hover:text-cyan-300">
          Log in
        </Link>
        <Link href="/signup" className="text-zinc-400 hover:text-zinc-200">
          Sign up
        </Link>
      </div>
    );
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-300" title={user.email}>
        {user.email}
      </span>
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-1 rounded border border-panel-border px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:border-red-500/40 hover:text-red-400"
      >
        <LogOut className="h-3 w-3" aria-hidden />
        Log out
      </button>
    </div>
  );
}