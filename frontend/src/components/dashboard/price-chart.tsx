"use client";

import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchItemSeries, type PricePoint } from "@/lib/use-history";

interface Props {
  itemId: string;
  title: string;
  target: number;
}

/** Per-item price history line chart (data from the agent's scan decisions). */
export function PriceChart({ itemId, title, target }: Props) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);

  // no synchronous reset needed: the watchlist unmounts this component
  // when the chart row closes, so every open starts from the null state
  useEffect(() => {
    let alive = true;
    void fetchItemSeries(itemId).then((data) => {
      if (alive) setPoints(data);
    });
    return () => {
      alive = false;
    };
  }, [itemId]);

  if (points === null) {
    return (
      <div className="rounded-lg border border-panel-border bg-panel/40 px-4 py-6 font-mono text-xs text-muted">
        loading price history…
      </div>
    );
  }
  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-panel-border bg-panel/40 px-4 py-6 font-mono text-xs text-muted">
        no scan history yet — run a cycle to build the chart
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-panel-border bg-panel/40 px-2 py-3">
      <p className="px-2 pb-1 font-mono text-[11px] text-muted">
        price history — {title}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={points} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <XAxis dataKey="at" tick={{ fontSize: 10, fill: "#6b7280" }} minTickGap={30} />
          <YAxis
            domain={["dataMin", "dataMax"]}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            width={52}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "#0c0c12",
              border: "1px solid #27272a",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "price"]}
          />
          <ReferenceLine
            y={target}
            stroke="#22d3ee"
            strokeDasharray="4 4"
            label={{ value: "target", fill: "#22d3ee", fontSize: 10, position: "insideTopRight" }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
