"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BoardResult } from "@/lib/pipeline";
import { Panel, SectionTitle, Badge, Bar, Spinner } from "@/components/ui";
import {
  actionColor,
  actionLabel,
  crowdColor,
  pctStr,
  regimeColor,
  strategyColor,
  strategyShort,
} from "@/lib/ui";

function crowdingBarColor(index: number): string {
  if (index >= 75) return "bg-rose-400";
  if (index >= 55) return "bg-amber-400";
  if (index >= 30) return "bg-cyan-400";
  return "bg-emerald-400";
}

export default function Dashboard() {
  const [data, setData] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [llm, setLlm] = useState(false);
  const [source, setSource] = useState<"sim" | "live">("sim");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // No synchronous setState here — loading starts true on mount and is set true
    // by the toggle handlers on refetch; all state updates happen post-await.
    const params = new URLSearchParams();
    if (llm) params.set("llm", "1");
    if (source === "live") params.set("source", "live");
    fetch(`/api/board?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else {
          setError(null);
          setData(d as BoardResult);
        }
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [llm, source]);

  function switchSource(s: "sim" | "live") {
    if (s !== source) {
      setLoading(true);
      setSource(s);
    }
  }

  const ci = data?.crowdingIndex;
  const marketClosed =
    data && !data.decisions[0]?.packet.market.underlyingMarketOpen;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Trade the regime, not the signal.
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          CounterFlow OS reads the market, detects the regime, routes to the best
          strategy, debates it across a multi-agent council, risk-checks the trade,
          and writes an auditable proof packet for every decision — across 24/7
          tokenized US stocks.
        </p>
      </div>

      {/* Agent Crowding Index */}
      <Panel>
        <SectionTitle
          title="Agent Crowding Index"
          hint="Market-wide read of how crowded the tokenized-stock tape looks to AI agents"
          right={
            marketClosed ? (
              <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                US market closed · token market live
              </Badge>
            ) : (
              <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                US market open
              </Badge>
            )
          }
        />
        {ci ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-baseline gap-2">
              <span className="mono text-4xl font-semibold">{ci.index}</span>
              <span className="text-muted">/ 100</span>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{ci.state}</span>
                <span className="text-muted">{ci.extremeAssets} extreme asset(s)</span>
              </div>
              <Bar value={ci.index} max={100} className={crowdingBarColor(ci.index)} height="h-2" />
              <p className="mt-2 text-xs text-muted">{ci.recommendation}</p>
            </div>
          </div>
        ) : loading ? (
          <Spinner />
        ) : null}
      </Panel>

      {/* Strategy board */}
      <Panel>
        <SectionTitle
          title="Strategy Board"
          hint="One routing decision per asset — click a row for the full proof packet"
          right={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border hairline text-xs">
                <button
                  onClick={() => switchSource("sim")}
                  className={`px-3 py-1 ${source === "sim" ? "bg-cyan-500/20 text-cyan-200" : "text-muted hover:bg-white/5"}`}
                >
                  Demo
                </button>
                <button
                  onClick={() => switchSource("live")}
                  className={`px-3 py-1 ${source === "live" ? "bg-emerald-500/20 text-emerald-200" : "text-muted hover:bg-white/5"}`}
                >
                  ⚡ Live
                </button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={llm}
                  onChange={(e) => {
                    setLoading(true);
                    setLlm(e.target.checked);
                  }}
                  className="accent-cyan-400"
                />
                AI reasoning (Qwen)
              </label>
            </div>
          }
        />

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </p>
        )}

        {loading && !data ? (
          <Spinner
            label={
              source === "live"
                ? "Fetching live Bitget + Yahoo data…"
                : llm
                  ? "Running council with Qwen…"
                  : "Scanning market…"
            }
          />
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Regime</th>
                  <th className="py-2 pr-3 font-medium">Strategy</th>
                  <th className="py-2 pr-3 text-right font-medium">Crowd</th>
                  <th className="py-2 pr-3 text-right font-medium">Gap</th>
                  <th className="py-2 pr-3 text-right font-medium">Conf</th>
                  <th className="py-2 pr-3 text-right font-medium">Agree</th>
                  <th className="py-2 pr-3 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.decisions.map(({ packet: p }) => (
                  <tr
                    key={p.asset}
                    className="group border-b hairline transition-colors last:border-0 hover:bg-white/5"
                  >
                    <td className="py-3 pr-3">
                      <Link href={`/asset/${p.asset}`} className="block">
                        <div className="font-semibold">{p.asset}</div>
                        <div className="mono text-xs text-muted">
                          ${p.market.tokenPrice.toFixed(2)}
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge className={regimeColor(p.marketRegime)}>{p.marketRegime}</Badge>
                    </td>
                    <td className={`py-3 pr-3 font-medium ${strategyColor(p.selectedStrategy)}`}>
                      {strategyShort(p.selectedStrategy)}
                    </td>
                    <td className={`mono py-3 pr-3 text-right ${crowdColor(p.scores.crowdScore)}`}>
                      {p.scores.crowdScore}
                    </td>
                    <td className="mono py-3 pr-3 text-right">{pctStr(p.scores.fairValueGapPct)}</td>
                    <td className="mono py-3 pr-3 text-right">
                      {(p.scores.strategyConfidence * 100).toFixed(0)}%
                    </td>
                    <td className="mono py-3 pr-3 text-right text-muted">
                      {p.agentAgreement.agree}/{p.agentAgreement.total}
                    </td>
                    <td className="py-3 pr-3 text-center">
                      <Badge className={actionColor(p.finalAction)}>{actionLabel(p.finalAction)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.source === "live" &&
              data.decisions.every((d) => d.packet.finalAction === "no_trade") && (
                <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-200/90">
                  Live tracking errors are small right now, so the system stands aside —
                  disciplined No-Trade. Switch to <strong>Demo</strong> to see active routing
                  across all six regimes.
                </p>
              )}
            <p className="mt-3 text-xs text-muted">
              Data:{" "}
              <span className="mono">
                {data.source === "live"
                  ? "LIVE — Bitget tokenized prices + Yahoo underlying (real tracking error)"
                  : "Demo scenario (seeded, reproducible)"}
              </span>{" "}
              · Reasoning:{" "}
              <span className="mono">
                {data.decisions[0]?.packet.reasoningSource === "qwen"
                  ? `Qwen (${data.decisions[0]?.packet.reasoningModel})`
                  : "deterministic narrator"}
              </span>{" "}
              · {new Date(data.timestamp).toUTCString()}
            </p>
            {data.sourceNote && (
              <p className="mt-1 text-xs text-amber-300/80">{data.sourceNote}</p>
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
