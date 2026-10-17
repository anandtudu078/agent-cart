import {
  Activity,
  Bot,
  Eye,
  History as HistoryIcon,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import { ActivityLog } from "@/components/dashboard/activity-log";
import { historyEntries, stats, watchedItems } from "@/lib/mock-data";

const ICONS = {
  eye: Eye,
  trend: TrendingDown,
  bot: Bot,
  cart: ShoppingCart,
} as const;

const HISTORY_DOT = {
  buy: "bg-fuchsia-400",
  alert: "bg-cyan-400",
  scan: "bg-zinc-500",
  info: "bg-emerald-400",
} as const;

function SectionHeading({
  id,
  title,
  hint,
  icon: Icon,
}: {
  id?: string;
  title: string;
  hint: string;
  icon: typeof Eye;
}) {
  return (
    <div id={id} className="mb-4 flex scroll-mt-8 items-baseline gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Icon className="h-4 w-4 text-cyan-400" aria-hidden />
        {title}
      </h2>
      <span className="font-mono text-xs text-muted">{hint}</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      {/* Header + stats */}
      <section id="overview" className="scroll-mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-cyan-400">$ agentcart dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Good morning, operator
            </h1>
            <p className="mt-1 text-sm text-muted">
              The agent is scanning 5 items every 30 seconds.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1.5 font-mono text-xs text-muted">
            <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
            next cycle in 30s
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = ICONS[stat.icon];
            return (
              <div
                key={stat.label}
                className="rounded-xl border border-panel-border bg-panel/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">{stat.label}</p>
                  <Icon className="h-4 w-4 text-muted" aria-hidden />
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11px] text-muted/80">{stat.hint}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Watchlist */}
      <section>
        <SectionHeading
          id="watchlist"
          title="Watchlist"
          hint="active price watches"
          icon={Eye}
        />
        <div className="overflow-hidden rounded-xl border border-panel-border bg-panel/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-panel-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Retailer</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Target</th>
                <th className="px-4 py-3 text-right font-medium">24h</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {watchedItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-panel-border/60 last:border-0 transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden>{item.emoji}</span>
                      <span className="text-zinc-200">{item.title}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{item.retailer}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    ${item.target.toFixed(2)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      item.deltaPct < 0
                        ? "text-emerald-400"
                        : item.deltaPct > 0
                          ? "text-red-400"
                          : "text-muted"
                    }`}
                  >
                    {item.deltaPct > 0 ? "+" : ""}
                    {item.deltaPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-panel-border px-2 py-0.5 text-[11px] capitalize text-zinc-300">
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-muted">
                    {item.updated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* History */}
      <section>
        <SectionHeading
          id="history"
          title="History"
          hint="recent agent decisions"
          icon={HistoryIcon}
        />
        <ul className="flex flex-col gap-2">
          {historyEntries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-lg border border-panel-border bg-panel/60 px-4 py-3"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${HISTORY_DOT[entry.kind]}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200">
                  {entry.action}
                  <span className="text-muted"> — {entry.item}</span>
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {entry.detail}
                </p>
              </div>
              <time className="font-mono text-[11px] text-muted">
                {entry.at}
              </time>
            </li>
          ))}
        </ul>
      </section>

      {/* Live activity log */}
      <section id="activity" className="scroll-mt-8 pb-4">
        <SectionHeading
          title="Agent activity"
          hint="real-time stream"
          icon={Activity}
        />
        <div className="h-72">
          <ActivityLog />
        </div>
      </section>
    </div>
  );
}