"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BoardResult, ScanOutcome } from "@/lib/pipeline";
import { Panel, SectionTitle, Badge, Bar, Stat, KeyVal, Spinner } from "@/components/ui";
import StreamingCouncil from "@/components/StreamingCouncil";
import PriceChart from "@/components/PriceChart";
import {
  actionColor,
  actionLabel,
  agentColor,
  crowdColor,
  directionColor,
  pctStr,
  regimeColor,
  riskStateColor,
  stanceLabel,
  strategyColor,
  strategyShort,
} from "@/lib/ui";

export default function AssetDetail({ symbol }: { symbol: string }) {
  const [decision, setDecision] = useState<ScanOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [llm, setLlm] = useState(false);
  const [source, setSource] = useState<"sim" | "live">("sim");
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [history, setHistory] = useState<{ token: { t: number; price: number }[]; underlying: { t: number; price: number }[]; source: "live" | "sim" } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [boardSource, setBoardSource] = useState<"live" | "sim">("sim");
  const [sourceNote, setSourceNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (llm) params.set("llm", "1");
    if (source === "live") params.set("source", "live");
    fetch(`/api/board?${params}`)
      .then((r) => r.json())
      .then((d: BoardResult & { error?: string }) => {
        if (!active) return;
        if (d.error) {
          setError(d.error);
          return;
        }
        const found = d.decisions?.find((x) => x.packet.asset === symbol) ?? null;
        if (!found) setError(`No decision found for ${symbol}`);
        else {
          setError(null);
          setDecision(found);
          setBoardSource(d.source);
          setSourceNote(d.sourceNote ?? null);
        }
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [symbol, llm, source]);

  useEffect(() => {
    let active = true;
    fetch(`/api/history?asset=${symbol}&source=${source}`)
      .then((r) => r.json())
      .then((h) => {
        if (!active) return;
        if (h.error) setHistoryError(h.error);
        else {
          setHistory(h);
          setHistoryError(null);
        }
      })
      .catch((e) => active && setHistoryError(String(e)));
    return () => {
      active = false;
    };
  }, [symbol, source]);

  function switchSource(s: "sim" | "live") {
    if (s !== source) {
      setError(null);
      setLoading(true);
      setSource(s);
    }
  }

  if (loading && !decision) return <Spinner label="Loading decision packet…" />;
  if (error)
    return (
      <Panel>
        <p className="text-rose-300">{error}</p>
        <Link href="/" className="mt-3 inline-block text-sm text-cyan-300 hover:text-cyan-200">
          ← Back to dashboard
        </Link>
      </Panel>
    );
  if (!decision) return null;

  const liveFellBack = source === "live" && boardSource === "sim";

  const p = decision.packet;
  const led = decision.ledgerEntry;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-white">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-3">
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
                setError(null);
                setLoading(true);
                setLlm(e.target.checked);
              }}
              className="accent-cyan-400"
            />
            AI debate (Qwen)
          </label>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{p.asset}</h1>
        <Badge className={regimeColor(p.marketRegime)}>{p.marketRegime}</Badge>
        <Badge className={actionColor(p.finalAction)}>{actionLabel(p.finalAction)}</Badge>
        <span className={`text-sm font-medium ${strategyColor(p.selectedStrategy)}`}>
          {strategyShort(p.selectedStrategy)}
        </span>
        <span className="mono ml-auto text-xs text-muted">{p.decisionId}</span>
      </div>

      {liveFellBack && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-300">
          Live feed unavailable — showing the seeded demo. {sourceNote ?? ""}
        </p>
      )}

      {/* Rationale */}
      <Panel className="glow-cyan">
        <p className="text-sm leading-relaxed text-slate-200">{p.rationale}</p>
      </Panel>

      {/* Price vs underlying */}
      <Panel>
        <SectionTitle
          title="Price vs Underlying"
          hint="Token trades 24/7; underlying only in market hours — the gap is the tracking error"
        />
        {history ? (
          <PriceChart token={history.token} underlying={history.underlying} source={history.source} />
        ) : historyError ? (
          <p className="py-6 text-sm text-muted">Price history unavailable.</p>
        ) : (
          <Spinner label="Loading price history…" />
        )}
      </Panel>

      {/* Scores + price */}
      <div className="grid gap-4 md:grid-cols-3">
        <Panel>
          <SectionTitle title="Pricing" />
          <KeyVal k="Token price" v={`$${p.market.tokenPrice.toFixed(2)}`} />
          <KeyVal k="Estimated fair value" v={`$${p.market.estimatedFairValue.toFixed(2)}`} />
          <KeyVal
            k="Fair-value gap"
            v={<span className={p.scores.fairValueGapPct >= 0 ? "text-rose-300" : "text-emerald-300"}>{pctStr(p.scores.fairValueGapPct)}</span>}
          />
          <KeyVal k="Underlying" v={`$${p.market.underlyingPrice.toFixed(2)}`} />
          <KeyVal k="Underlying market" v={p.market.underlyingMarketOpen ? "Open" : "Closed (24/7 token)"} />
          <KeyVal k="Spread" v={`${p.market.spreadPct}%`} />
        </Panel>

        <Panel className="md:col-span-2">
          <SectionTitle title="Scores" hint="Transparent, weighted — no black box" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="CrowdScore"
              value={<span className={crowdColor(p.scores.crowdScore)}>{p.scores.crowdScore}</span>}
              sub={<Bar value={p.scores.crowdScore} max={100} className="bg-rose-400 mt-1" />}
            />
            <Stat label="Fair-Value Gap" value={pctStr(p.scores.fairValueGapPct)} />
            <Stat
              label="Regime Conf."
              value={`${(p.scores.regimeConfidence * 100).toFixed(0)}%`}
              sub={<Bar value={p.scores.regimeConfidence} className="bg-cyan-400 mt-1" />}
            />
            <Stat
              label="Strategy Conf."
              value={`${(p.scores.strategyConfidence * 100).toFixed(0)}%`}
              sub={<Bar value={p.scores.strategyConfidence} className="bg-emerald-400 mt-1" />}
            />
            <Stat
              label="Liquidity"
              value={p.scores.liquidityScore.toFixed(2)}
              sub={<Bar value={p.scores.liquidityScore} className="bg-sky-400 mt-1" />}
            />
            <Stat
              label="Risk"
              value={p.scores.riskScore.toFixed(2)}
              sub={<Bar value={p.scores.riskScore} className="bg-amber-400 mt-1" />}
            />
          </div>
        </Panel>
      </div>

      {/* Council debate */}
      <Panel>
        <SectionTitle
          title="Multi-Agent Strategy Council"
          hint={`Agreement ${p.agentAgreement.agree}/${p.agentAgreement.total}`}
          right={
            <Badge className="border-slate-500/40 bg-slate-500/10 text-slate-300">
              {p.reasoningSource === "qwen" ? `Qwen ${p.reasoningModel}` : "deterministic"}
            </Badge>
          }
        />
        <div className="mb-3">
          <StreamingCouncil symbol={symbol} source={source} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {p.council.map((a, i) => (
            <div
              key={a.agent}
              className="cf-reveal rounded-xl border hairline bg-black/20 p-3"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${agentColor(a.agent)}`}>{a.agent}</span>
                <Badge className="border-slate-500/40 bg-slate-500/10 text-slate-300">
                  {stanceLabel(a.vote.stance)} · {(a.vote.confidence * 100).toFixed(0)}%
                </Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{a.summary}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border hairline bg-black/30 p-4">
          <div className="mb-1 text-xs uppercase tracking-wider text-muted">Debate narrative</div>
          <pre className="mono whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{p.debate}</pre>
        </div>
      </Panel>

      {/* Risk + rejected + trade plan */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <SectionTitle
            title="Risk Governor"
            right={<Badge className={riskStateColor(p.risk.riskState)}>{p.risk.riskState}</Badge>}
          />
          <KeyVal k="Approved" v={p.risk.approved ? "Yes" : "No"} />
          <KeyVal k="Position size" v={`${p.risk.positionSizePct}%`} />
          <KeyVal k="Stop-loss" v={`${p.risk.stopLossPct}%`} />
          <KeyVal k="Take-profit" v={`${p.risk.takeProfitPct}%`} />
          <KeyVal k="Data freshness" v={p.dataFreshness} />
          <div className="mt-3 space-y-1">
            {p.risk.reasons.map((r, i) => (
              <p key={i} className="text-xs text-slate-400">• {r}</p>
            ))}
            {p.risk.blocks.map((b, i) => (
              <p key={`b${i}`} className="text-xs text-rose-300">⛔ {b}</p>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Routing & Trade Plan" />
          <KeyVal
            k="Direction"
            v={<span className={directionColor(p.direction)}>{p.direction.toUpperCase()}</span>}
          />
          <KeyVal k="Final action" v={actionLabel(p.finalAction)} />
          {led.status === "closed" && (
            <>
              <KeyVal k="Entry → Exit" v={`$${led.entryPrice?.toFixed(2)} → $${led.exitPrice?.toFixed(2)}`} />
              <KeyVal
                k="Paper PnL"
                v={<span className={(led.pnlPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}>{pctStr(led.pnlPct)}</span>}
              />
              <KeyVal k="Exit reason" v={led.exitReason.replace("_", " ")} />
            </>
          )}
          <div className="mt-3 text-xs uppercase tracking-wider text-muted">Rejected strategies</div>
          <div className="mt-1 space-y-1.5">
            {p.rejectedStrategies.map((r) => (
              <div key={r.strategy} className="text-xs">
                <span className={`font-medium ${strategyColor(r.strategy)}`}>{strategyShort(r.strategy)}</span>
                <span className="text-slate-400"> — {r.reason}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Regime signals + data sources */}
      <Panel>
        <SectionTitle title="Regime Signals & Data Sources" />
        <div className="mb-3 flex flex-wrap gap-2">
          {p.regimeSignals.map((s) => (
            <Badge key={s} className={regimeColor(p.marketRegime)}>{s}</Badge>
          ))}
        </div>
        <p className="text-xs text-muted">
          Data sources: <span className="mono">{p.dataSourcesUsed.join(" · ")}</span>
        </p>
      </Panel>

      {/* Raw packet */}
      <Panel>
        <button
          onClick={() => setShowJson((v) => !v)}
          className="text-sm font-medium text-cyan-300 hover:text-cyan-200"
        >
          {showJson ? "▾ Hide" : "▸ Show"} raw Trade Decision Packet (JSON)
        </button>
        {showJson && (
          <pre className="mono mt-3 max-h-[480px] overflow-auto rounded-lg border hairline bg-black/40 p-4 text-xs leading-relaxed text-slate-300">
            {JSON.stringify(p, null, 2)}
          </pre>
        )}
      </Panel>
    </div>
  );
}
