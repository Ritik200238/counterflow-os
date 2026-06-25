"use client";

import { useEffect, useState } from "react";
import { Panel, SectionTitle, Stat, Bar, Spinner, ErrorNote } from "@/components/ui";
import { pctStr } from "@/lib/ui";
import type { BaselineResult, Diagnostics } from "@/lib/shadow";

interface ShadowData {
  diagnostics: Diagnostics;
  counterflow: BaselineResult;
  baselines: BaselineResult[];
}

export default function ShadowView() {
  const [data, setData] = useState<ShadowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/shadow")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setData(d as ShadowData);
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading && !data) return <Spinner label="Running shadow diagnostics…" />;
  if (error) return <ErrorNote message={`Couldn't load Decision Shadow: ${error}`} />;
  if (!data) return null;

  const d = data.diagnostics;
  const rows = [data.counterflow, ...data.baselines];
  const bestTotal = Math.max(...rows.map((r) => r.totalPnlPct));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Decision Shadow</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Behavioral diagnostics on the agent&apos;s own paper ledger, plus a shadow comparison
          against naive baselines on the identical market — does routing by regime actually beat
          trading everything blindly? Honest either way.
        </p>
      </div>

      {/* Shadow comparison */}
      <Panel>
        <SectionTitle title="CounterFlow vs naive baselines" hint="Same market, per-trade returns (sum & average)" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-medium">Approach</th>
                <th className="py-2 pr-3 text-right font-medium">Trades</th>
                <th className="py-2 pr-3 text-right font-medium">Win rate</th>
                <th className="py-2 pr-3 text-right font-medium">Avg / trade</th>
                <th className="py-2 pr-3 text-right font-medium">Total PnL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className={`border-b hairline last:border-0 ${i === 0 ? "bg-cyan-500/5" : ""}`}>
                  <td className="py-2.5 pr-3">
                    <span className={i === 0 ? "font-semibold text-cyan-200" : "text-slate-200"}>{r.name}</span>
                    <div className="text-xs text-muted">{r.description}</div>
                  </td>
                  <td className="mono py-2.5 pr-3 text-right">{r.trades}</td>
                  <td className="mono py-2.5 pr-3 text-right">{r.winRate === null ? "—" : `${(r.winRate * 100).toFixed(0)}%`}</td>
                  <td className="mono py-2.5 pr-3 text-right">{pctStr(r.avgReturnPct)}</td>
                  <td className={`mono py-2.5 pr-3 text-right ${r.totalPnlPct === bestTotal ? "text-emerald-300" : r.totalPnlPct < 0 ? "text-rose-300" : "text-slate-200"}`}>
                    {pctStr(r.totalPnlPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Baselines trade on every decision (no discipline); CounterFlow only trades when a strategy
          has edge — note the trade count difference. Baselines computed on the canonical backtest.
        </p>
      </Panel>

      {/* Diagnostics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="No-trade rate" value={`${d.noTradeRatePct}%`} sub="discipline" />
        <Stat label="Avg hold" value={d.avgHoldMinutes != null ? `${d.avgHoldMinutes}m` : "—"} />
        <Stat label="Take-profit exits" value={`${d.exitMix.takeProfit}%`} />
        <Stat label="Stop-loss exits" value={`${d.exitMix.stopLoss}%`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionTitle title="Edge by confidence band" hint="Higher confidence should mean higher win rate" />
          <div className="space-y-3">
            {d.byConfidence.map((b) => (
              <div key={b.band} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm">{b.band}</span>
                <span className="mono w-20 text-xs text-muted">{b.trades} trades</span>
                <span className="mono w-12 text-right text-sm">{b.winRate === null ? "—" : `${(b.winRate * 100).toFixed(0)}%`}</span>
                <div className="flex-1">
                  <Bar value={b.winRate ?? 0} max={1} className="bg-emerald-400" />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Behavioral flags" />
          <div className="space-y-2">
            {d.flags.map((f, i) => (
              <p key={i} className="text-sm text-slate-300">• {f}</p>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
