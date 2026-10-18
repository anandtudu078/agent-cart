import {
  Activity,
  Bot,
  Eye,
  History as HistoryIcon,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import { ActivityLog } from "@/components/dashboard/activity-log";
import { HistoryFeed } from "@/components/dashboard/history-feed";
import { Watchlist } from "@/components/dashboard/watchlist";
import { stats } from "@/lib/mock-data";

const ICONS = {
  eye: Eye,
  trend: TrendingDown,
  bot: Bot,
  cart: ShoppingCart,
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
        <Watchlist />
      </section>

      {/* History */}
      <section>
        <SectionHeading
          id="history"
          title="History"
          hint="recent agent decisions"
          icon={HistoryIcon}
        />
        <HistoryFeed />
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