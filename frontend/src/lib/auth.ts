"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "./api";

export interface SessionUser {
  id: string;
  email: string;
}

/** Loads the current session from the backend (null when logged out). */
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: SessionUser } | null) => {
        if (alive) setUser(data?.user ?? null);
      })
      .catch(() => {
        /* backend down — treat as logged out */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { user, loading, setUser };
}