"use client";

import { useEffect, useState } from "react";
import { Panel, SectionTitle, Bar, Spinner } from "@/components/ui";
import { strategyShort } from "@/lib/ui";
import type { Strategy } from "@/lib/types";
import type { AutopilotResult } from "@/lib/autopilot";

const ORDER: Strategy[] = [
  "Momentum Follow",
  "CounterFlow Fade",
  "Fair-Value Convergence",
  "Volatility Breakout",
  "Earnings Drift",
  "Macro Rebalance",
  "No-Trade / Risk-Off",
];

const FILL: Record<Strategy, string> = {
  "Momentum Follow": "#34d399",
  "CounterFlow Fade": "#fb7185",
  "Fair-Value Convergence": "#22d3ee",
  "Volatility Breakout": "#fbbf24",
  "Earnings Drift": "#a78bfa",
  "Macro Rebalance": "#fb923c",
  "No-Trade / Risk-Off": "#64748b",
};

const BAR_CLASS: Record<Strategy, string> = {
  "Momentum Follow": "bg-emerald-400",
  "CounterFlow Fade": "bg-rose-400",
  "Fair-Value Convergence": "bg-cyan-400",
  "Volatility Breakout": "bg-amber-400",
  "Earnings Drift": "bg-violet-400",
  "Macro Rebalance": "bg-orange-400",
  "No-Trade / Risk-Off": "bg-slate-500",
};

function Timeline({ data }: { data: AutopilotResult }) {
  const pts = data.timeline;
  if (pts.length < 2) {
    return <p className="py-6 text-sm text-muted">Not enough history yet to chart rebalancing.</p>;
  }
  const W = 800;
  const H = 220;
  const padB = 18;
  const colW = (W / pts.length) * 0.8;
  const gap = (W / pts.length) * 0.2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" preserveAspectRatio="none">
      {pts.map((p, i) => {
        const x = i * (colW + gap) + gap / 2;
        let yAcc = 0;
        return (
          <g key={i}>
            {ORDER.map((s) => {
              const h = ((p.weights[s] ?? 0) / 100) * (H - padB);
              const y = yAcc;
              yAcc += h;
              return <rect key={s} x={x} y={y} width={colW} height={h} fill={FILL[s]} opacity={0.85} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

export default function AutopilotView() {
  const [data, setData] = useState<AutopilotResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/autopilot")
      .then((r) => r.json())
      .then((d) => active && setData(d as AutopilotResult))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading && !data) return <Spinner label="Loading autopilot allocation…" />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Strategy Autopilot</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Allocates paper capital across strategies from trailing performance, rotating as the regime
          mix shifts — with a cash floor for No-Trade / Risk-Off. Rolling window: {data.window} trades.
        </p>
      </div>

      <Panel>
        <SectionTitle title="Current Allocation" />
        <div className="space-y-2.5">
          {ORDER.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-sm">{strategyShort(s)}</span>
              <span className="mono w-10 text-right text-sm">{data.current[s] ?? 0}%</span>
              <div className="flex-1">
                <Bar value={data.current[s] ?? 0} max={100} className={BAR_CLASS[s]} height="h-2.5" />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle title="Allocation Over Time" hint="Each column is one rebalance — capital rotates with the regime" />
        <Timeline data={data} />
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          {ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FILL[s] }} />
              {strategyShort(s)}
            </span>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle title="Rotation Log" />
        <div className="space-y-1.5">
          {data.notes.map((n, i) => (
            <p key={i} className="text-sm text-slate-300">
              • {n}
            </p>
          ))}
        </div>
      </Panel>
    </div>
  );
}
