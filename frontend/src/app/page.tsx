import { Activity, Eye, History as HistoryIcon } from "lucide-react";
import { ActivityLog } from "@/components/dashboard/activity-log";
import { AgentStatusBadge } from "@/components/dashboard/agent-status";
import { HistoryFeed } from "@/components/dashboard/history-feed";
import { Stats } from "@/components/dashboard/stats";
import { Watchlist } from "@/components/dashboard/watchlist";

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
              Watchlist, history, and stats below are live from the API.
            </p>
          </div>
          <AgentStatusBadge />
        </div>

        <Stats />
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
