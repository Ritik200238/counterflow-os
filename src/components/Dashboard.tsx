"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BoardResult } from "@/lib/pipeline";
import { ASSETS } from "@/lib/market/assets";
import type { AssetSymbol } from "@/lib/types";
import { Badge, Spinner, ErrorNote } from "@/components/ui";
import Sparkline from "@/components/Sparkline";
import {
  actionColor,
  actionLabel,
  crowdColor,
  pctStr,
  regimeColor,
  regimeDot,
  strategyColor,
  strategyShort,
} from "@/lib/ui";

function crowdingPill(index: number): string {
  if (index >= 75) return "text-neg border-neg/25 bg-neg/10";
  if (index >= 55) return "text-warn border-warn/25 bg-warn/10";
  if (index >= 30) return "text-info border-info/25 bg-info/10";
  return "text-pos-ink border-pos/25 bg-pos/10";
}

export default function Dashboard() {
  const [data, setData] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [llm, setLlm] = useState(false);
  const [source, setSource] = useState<"sim" | "live">("sim");
  const [error, setError] = useState<string | null>(null);
  const [sparks, setSparks] = useState<Record<string, number[]>>({});

  useEffect(() => {
    let active = true;
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

  // Real recent price sparklines for each card (token series from /api/history).
  useEffect(() => {
    if (!data) return;
    let active = true;
    const syms = data.decisions.map((d) => d.packet.asset);
    Promise.all(
      syms.map((s) =>
        fetch(`/api/history?asset=${s}&source=${source}`)
          .then((r) => r.json())
          .then((h) => [s, ((h.token as { price: number }[]) ?? []).map((p) => p.price)] as const)
          .catch(() => [s, [] as number[]] as const),
      ),
    ).then((pairs) => active && setSparks(Object.fromEntries(pairs)));
    return () => {
      active = false;
    };
  }, [data, source]);

  function switchSource(s: "sim" | "live") {
    if (s !== source) {
      setLoading(true);
      setSource(s);
    }
  }

  const ci = data?.crowdingIndex;
  const actionable = data ? data.decisions.filter((d) => d.packet.finalAction !== "no_trade").length : 0;
  const noTrade = data ? data.decisions.length - actionable : 0;

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">Market board</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted2">
            Trade the regime, not the signal. The router reads all five tokenized names, picks a
            strategy per regime, and records every decision — including the decisions not to trade.
          </p>
          {data && (
            <p className="mt-2 text-xs text-muted">
              {source === "live" ? "Live" : "Demo"} · {actionable} actionable · {noTrade} no-trade
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted2">
            <input
              type="checkbox"
              checked={llm}
              onChange={(e) => {
                setLoading(true);
                setLlm(e.target.checked);
              }}
              className="accent-[#1F8A5B]"
            />
            Reasoning
          </label>
          <div className="flex gap-0.5 rounded-lg border hairline bg-[#F0EFEA] p-0.5 text-xs">
            <button
              onClick={() => switchSource("sim")}
              className={`rounded-md px-3 py-1 transition-colors ${source === "sim" ? "bg-card font-medium text-ink shadow-sm" : "text-muted2 hover:text-ink"}`}
            >
              Demo
            </button>
            <button
              onClick={() => switchSource("live")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${source === "live" ? "bg-card font-medium text-ink shadow-sm" : "text-muted2 hover:text-ink"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${source === "live" ? "bg-pos" : "bg-muted"}`} /> Live
            </button>
          </div>
        </div>
      </div>

      {/* Source note */}
      <div className="rounded-xl border hairline bg-[#FBFAF8] px-4 py-3 text-sm text-muted2">
        <span className="mr-1.5 text-[#B5852A]">◆</span>
        {source === "live"
          ? data?.sourceNote ??
            "Live data · real Bitget tokenized prices and Yahoo underlying — the gaps are actual tracking errors."
          : "Demo data · a reproducible simulation that exercises all six regimes and shows active strategy routing for a clear narrative."}
      </div>

      {error && <ErrorNote message={`Couldn't load the board: ${error}`} />}

      {/* Agent Crowding Index */}
      <div className="panel p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Agent Crowding Index</p>
        {ci ? (
          <>
            <div className="mt-2 flex items-center gap-3">
              <span className="mono text-5xl font-semibold leading-none text-ink">{ci.index}</span>
              <Badge className={crowdingPill(ci.index)}>{ci.state}</Badge>
              <span className="ml-auto text-xs text-muted">{ci.extremeAssets} extreme asset(s)</span>
            </div>
            <p className="mt-3 max-w-2xl text-sm text-muted2">{ci.recommendation}</p>

            {/* gradient scale + marker */}
            <div className="mt-4">
              <div className="relative h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg,#1F8A5B 0%,#B5852A 55%,#C8453B 100%)" }}>
                <span
                  className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                  style={{ left: `${Math.max(0, Math.min(100, ci.index))}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>0 · calm</span>
                <span>50</span>
                <span>crowded · 100</span>
              </div>
            </div>

            {/* components */}
            <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {ci.components.map((c) => (
                <div key={c.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted2">{c.label}</span>
                    <span className="mono text-ink">{c.value}</span>
                  </div>
                  <div className="mt-1 h-px w-full bg-[#ECECE8]">
                    <div className="h-px bg-ink/60" style={{ width: `${Math.max(0, Math.min(100, c.value))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : loading ? (
          <Spinner />
        ) : (
          <p className="py-2 text-sm text-muted2">{error ? "Crowding index unavailable." : "No data."}</p>
        )}
      </div>

      {/* Asset cards */}
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
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.decisions.map(({ packet: p }) => (
              <Link key={p.asset} href={`/asset/${p.asset}`} className="panel block p-5 transition-shadow hover:shadow-[0_2px_12px_rgba(10,10,10,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold tracking-tight text-ink">{p.asset}</span>
                      <span className="text-xs text-muted">{ASSETS[p.asset as AssetSymbol]?.name}</span>
                    </div>
                    <div className="mt-1.5">
                      <Badge className={regimeColor(p.marketRegime)}>
                        <span className={`h-1.5 w-1.5 rounded-full ${regimeDot(p.marketRegime)}`} />
                        {p.marketRegime}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={actionColor(p.finalAction)}>
                      {p.finalAction === "long_paper" ? "▲ " : p.finalAction === "short_paper" ? "▼ " : "— "}
                      {actionLabel(p.finalAction)}
                    </Badge>
                    <div className={`mt-1.5 text-xs font-medium ${strategyColor(p.selectedStrategy)}`}>
                      {strategyShort(p.selectedStrategy)}
                    </div>
                  </div>
                </div>

                <div className="my-3">
                  <Sparkline points={sparks[p.asset] ?? []} />
                </div>

                <div className="grid grid-cols-3 gap-2 border-t hairline pt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted">Crowd</div>
                    <div className={`mono mt-0.5 text-sm font-medium ${crowdColor(p.scores.crowdScore)}`}>{p.scores.crowdScore}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted">FV Gap</div>
                    <div className={`mono mt-0.5 text-sm font-medium ${p.scores.fairValueGapPct >= 0 ? "text-neg" : "text-pos-ink"}`}>
                      {pctStr(p.scores.fairValueGapPct)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted">Council</div>
                    <div className="mono mt-0.5 text-sm font-medium text-ink">
                      {p.agentAgreement.agree}/{p.agentAgreement.total}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {data.source === "live" && data.decisions.every((d) => d.packet.finalAction === "no_trade") && (
            <p className="rounded-xl border border-pos/25 bg-pos/8 p-3 text-xs text-pos-ink">
              Live tracking errors are small right now, so the system stands aside — disciplined No-Trade.
              Switch to <strong>Demo</strong> to see active routing across all six regimes.
            </p>
          )}

          <p className="text-xs text-muted">
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
            </span>
          </p>
        </>
      ) : null}
    </div>
  );
}
