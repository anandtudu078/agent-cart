"use client";

import Link from "next/link";
import {
  Activity,
  Eye,
  History as HistoryIcon,
  LayoutDashboard,
  Pause,
  Settings,
} from "lucide-react";
import {
  useWatchItems,
  type WatchStatus,
} from "@/lib/use-watch-items";
import { useAgent } from "@/lib/use-agent";
import { useHistory } from "@/lib/use-history";
import { MiniActivity } from "./mini-activity";
import { AuthFooter } from "./auth-footer";

const NAV = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#watchlist", label: "Watchlist", icon: Eye },
  { href: "#history", label: "History", icon: HistoryIcon },
  { href: "#activity", label: "Agent activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

const STATUS_DOT: Record<WatchStatus, string> = {
  watching: "bg-emerald-400",
  drop: "bg-cyan-400",
  paused: "bg-zinc-500",
};

const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: "Watching",
  drop: "Drop found",
  paused: "Paused",
};

const HISTORY_DOT = {
  buy: "bg-fuchsia-400",
  alert: "bg-cyan-400",
  scan: "bg-zinc-500",
  info: "bg-emerald-400",
} as const;

export function Sidebar() {
  const { items, loading } = useWatchItems();
  const { entries, loading: historyLoading } = useHistory();
  const { status } = useAgent();

  return (
    <aside className="flex h-full w-full flex-col border-r border-panel-border bg-panel/60">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
          <Activity className="h-4 w-4" aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">AgentCart</p>
          <p className="font-mono text-[11px] text-muted">
            agentic price-watch
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon className="h-4 w-4 text-muted" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      {/* Watched items */}
      <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
        <div className="flex items-center justify-between px-2.5 pb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Watched items
          </p>
          <span className="rounded-full bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">
            {loading ? "…" : items.length}
          </span>
        </div>

        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto pb-3">
          {loading && (
            <li className="px-2.5 py-2 font-mono text-[11px] text-muted">
              loading…
            </li>
          )}
          {!loading && items.length === 0 && (
            <li className="px-2.5 py-2 text-[12px] text-muted">
              no items watched yet
            </li>
          )}
          {items.map((item) => (
            <li key={item.id}>
              <div className="flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-white/5">
                <span className="mt-0.5 text-sm" aria-hidden>
                  {item.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-tight text-zinc-200">
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`}
                      aria-hidden
                    />
                    <span className="font-mono text-[11px] text-muted">
                      ${item.price.toFixed(2)}
                    </span>
                    <span className="text-[11px] text-muted/70">
                      · {STATUS_LABEL[item.status]}
                    </span>
                    {item.status === "paused" && (
                      <Pause className="h-3 w-3 text-muted/70" aria-hidden />
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* History (compact) */}
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between px-2.5 pb-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            History
          </p>
          <HistoryIcon className="h-3.5 w-3.5 text-muted" aria-hidden />
        </div>
        <ul className="flex flex-col gap-1 px-2.5">
          {historyLoading && (
            <li className="font-mono text-[11px] text-muted">loading…</li>
          )}
          {!historyLoading && entries.length === 0 && (
            <li className="text-[12px] text-muted">no decisions yet</li>
          )}
          {entries.slice(0, 3).map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${HISTORY_DOT[entry.kind]}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-400">
                {entry.action}
              </span>
              <time className="shrink-0 font-mono text-[10px] text-muted/80">
                {entry.at.slice(0, 5)}
              </time>
            </li>
          ))}
        </ul>
      </div>

      {/* Real-time agent activity (compact) */}
      <div className="px-3 pt-4">
        <div className="flex items-center justify-between px-2.5 pb-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Agent activity
          </p>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        </div>
        <div className="space-y-1 px-2.5">
          <MiniActivity />
        </div>
      </div>

      {/* Session + agent status */}
      <div className="flex flex-col gap-3 border-t border-panel-border px-5 py-4">
        <AuthFooter />
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                status ? "bg-emerald-400" : "bg-zinc-600"
              }`}
            />
            <span
              className={`absolute inline-flex h-2 w-2 rounded-full ${
                status ? "bg-emerald-400" : "bg-zinc-600"
              }`}
            />
          </span>
          {status ? "Agent online" : "Agent offline"}
          <span className="ml-auto font-mono text-[11px] text-muted">
            {status ? `poll ${status.intervalSec}s` : "poll —"}
          </span>
        </div>
      </div>
    </aside>
  );
}
