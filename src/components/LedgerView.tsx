"use client";

import { useEffect, useState } from "react";
import type { LedgerEntry, LedgerStats, StrategyMemory } from "@/lib/types";
import { ASSET_SYMBOLS, STRATEGIES } from "@/lib/types";
import { Panel, SectionTitle, Badge, Bar, Stat, Spinner, ErrorNote } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import {
  pctStr,
  regimeColor,
  strategyColor,
  strategyShort,
} from "@/lib/ui";

interface LedgerResponse {
  entries: LedgerEntry[];
  stats: LedgerStats;
}

export default function LedgerView() {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [memory, setMemory] = useState<StrategyMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState("");
  const [strategy, setStrategy] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped to trigger a reload after seed/scan actions, without calling a
  // setState-containing function directly inside the effect.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const q = new URLSearchParams();
    if (asset) q.set("asset", asset);
    if (strategy) q.set("strategy", strategy);
    Promise.all([
      fetch(`/api/ledger?${q}`).then((r) => r.json()),
      fetch("/api/strategy-memory").then((r) => r.json()),
    ])
      .then(([led, mem]) => {
        if (!active) return;
        if (led?.error || mem?.error) {
          setError(led?.error || mem?.error);
          return;
        }
        setError(null);
        setData(led as LedgerResponse);
        setMemory(mem as StrategyMemory);
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [asset, strategy, refreshKey]);

  async function runSeed() {
    if (!window.confirm("This replaces the entire ledger with a fresh 480-decision backtest (any live-scan / cron entries are discarded). Continue?")) {
      return;
    }
    setBusy("seed");
    setNote(null);
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions: 480 }),
      }).then((r) => r.json());
      if (res.error) {
        setNote(`Could not seed: ${res.error}`);
        return;
      }
      setNote(`Ledger replaced with a ${res.written}-decision backtest.`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNote(`Error: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runScan() {
    setBusy("scan");
    setNote(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" }).then((r) => r.json());
      if (res.error) {
        setNote(`Could not scan: ${res.error}`);
        return;
      }
      const src = res.source === "live" ? "live (Bitget + Yahoo)" : "demo";
      setNote(
        `Scan logged: ${res.appended} decisions appended (source: ${src}).${res.sourceNote ? " " + res.sourceNote : ""}`,
      );
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNote(`Error: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const stats = data?.stats;

  // Cumulative paper-PnL equity curve from closed trades, in chronological order.
  const equitySeries: number[] = (() => {
    const closed = (data?.entries ?? [])
      .filter((e) => e.status === "closed" && e.pnlValue !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let cum = 0;
    const pts = [0];
    for (const e of closed) {
      cum += e.pnlValue as number;
      pts.push(Number(cum.toFixed(4)));
    }
    return pts;
  })();

  const exportQuery = new URLSearchParams();
  if (asset) exportQuery.set("asset", asset);
  if (strategy) exportQuery.set("strategy", strategy);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trade Ledger</h1>
          <p className="text-sm text-muted">
            Every decision is logged, reproducible, and exportable. Paper / sim only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runScan}
            disabled={!!busy}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {busy === "scan" ? "Scanning…" : "Run live scan + log"}
          </button>
          <button
            onClick={runSeed}
            disabled={!!busy}
            className="rounded-lg border hairline bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {busy === "seed" ? "Running…" : "Run backtest seed"}
          </button>
        </div>
      </div>

      {note && (
        <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5 text-sm text-cyan-200">{note}</p>
      )}
      {error && <ErrorNote message={`Couldn't load the ledger: ${error}`} />}

      {/* Summary */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Decisions" value={stats.totalDecisions} />
          <Stat label="Paper trades" value={stats.totalTrades} sub={`${stats.noTrades} no-trade`} />
          <Stat
            label="Win rate"
            value={stats.winRate === null ? "—" : `${(stats.winRate * 100).toFixed(0)}%`}
            sub={`${stats.wins}W / ${stats.losses}L`}
          />
          <Stat
            label="Avg return / trade"
            value={pctStr(stats.avgReturnPct)}
            valueClass={(stats.avgReturnPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}
          />
          <Stat
            label="Total PnL (portfolio)"
            value={pctStr(stats.totalPnlValue)}
            valueClass={stats.totalPnlValue >= 0 ? "text-emerald-300" : "text-rose-300"}
          />
          <Stat label="Max drawdown (portfolio)" value={`${stats.maxDrawdownPct.toFixed(2)}%`} />
        </div>
      )}

      {/* Risk-adjusted metrics */}
      {stats && stats.closedTrades > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Sharpe (per trade)" value={stats.sharpe ?? "—"} />
          <Stat label="Sortino" value={stats.sortino ?? "—"} />
          <Stat label="Profit factor" value={stats.profitFactor ?? "—"} />
          <Stat
            label="Best trade"
            value={pctStr(stats.bestTradePct)}
            valueClass="text-emerald-300"
          />
          <Stat
            label="Worst trade"
            value={pctStr(stats.worstTradePct)}
            valueClass="text-rose-300"
          />
        </div>
      )}

      {/* Equity curve */}
      <Panel>
        <SectionTitle
          title="Equity Curve"
          hint="Cumulative paper PnL across closed trades (portfolio %)"
        />
        {data ? <EquityChart series={equitySeries} /> : <Spinner />}
      </Panel>

      {/* Strategy performance memory */}
      <Panel>
        <SectionTitle
          title="Strategy Performance Memory"
          hint="Win rate by strategy + autopilot allocation weights (PRD §17 / §35)"
        />
        {memory ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Strategy</th>
                  <th className="py-2 pr-3 text-right font-medium">Trades</th>
                  <th className="py-2 pr-3 text-right font-medium">Win rate</th>
                  <th className="py-2 pr-3 text-right font-medium">Avg return</th>
                  <th className="py-2 pr-3 font-medium">Best regime</th>
                  <th className="py-2 pr-3 font-medium">Worst regime</th>
                  <th className="py-2 pr-3 font-medium">Autopilot weight</th>
                </tr>
              </thead>
              <tbody>
                {memory.rows.map((r) => (
                  <tr key={r.strategy} className="border-b hairline last:border-0">
                    <td className={`py-2.5 pr-3 font-medium ${strategyColor(r.strategy)}`}>
                      {strategyShort(r.strategy)}
                    </td>
                    <td className="mono py-2.5 pr-3 text-right">{r.trades}</td>
                    <td className="mono py-2.5 pr-3 text-right">
                      {r.winRate === null ? "—" : `${(r.winRate * 100).toFixed(0)}%`}
                    </td>
                    <td className="mono py-2.5 pr-3 text-right">{pctStr(r.avgReturnPct)}</td>
                    <td className="py-2.5 pr-3">
                      {r.bestRegime ? <Badge className={regimeColor(r.bestRegime)}>{r.bestRegime}</Badge> : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.worstRegime ? <Badge className={regimeColor(r.worstRegime)}>{r.worstRegime}</Badge> : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="mono w-9 text-right">{r.currentWeight}%</span>
                        <div className="w-24">
                          <Bar value={r.currentWeight} max={100} className="bg-cyan-400" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Spinner />
        )}
      </Panel>

      {/* Trades */}
      <Panel>
        <SectionTitle
          title="Decisions"
          right={
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                value={asset}
                onChange={(e) => {
                  setLoading(true);
                  setAsset(e.target.value);
                }}
                className="rounded-lg border hairline bg-black/30 px-2 py-1 text-slate-200"
              >
                <option value="">All assets</option>
                {ASSET_SYMBOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={strategy}
                onChange={(e) => {
                  setLoading(true);
                  setStrategy(e.target.value);
                }}
                className="rounded-lg border hairline bg-black/30 px-2 py-1 text-slate-200"
              >
                <option value="">All strategies</option>
                {STRATEGIES.map((s) => (
                  <option key={s} value={s}>{strategyShort(s)}</option>
                ))}
              </select>
              <a
                href={`/api/ledger?format=csv&${exportQuery}`}
                className="rounded-lg border hairline bg-white/5 px-2.5 py-1 text-slate-200 hover:bg-white/10"
              >
                CSV
              </a>
              <a
                href={`/api/ledger?${exportQuery}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border hairline bg-white/5 px-2.5 py-1 text-slate-200 hover:bg-white/10"
              >
                JSON
              </a>
            </div>
          }
        />
        {loading && !data ? (
          <Spinner />
        ) : data && data.entries.length > 0 ? (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Regime</th>
                  <th className="py-2 pr-3 font-medium">Strategy</th>
                  <th className="py-2 pr-3 font-medium">Dir</th>
                  <th className="py-2 pr-3 text-right font-medium">Size</th>
                  <th className="py-2 pr-3 text-right font-medium">PnL</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...data.entries].reverse().map((e) => (
                  <tr key={e.decisionId} className="border-b hairline last:border-0">
                    <td className="mono py-2 pr-3 text-xs text-muted">{e.timestamp.slice(0, 16).replace("T", " ")}</td>
                    <td className="py-2 pr-3 font-medium">{e.asset}</td>
                    <td className="py-2 pr-3">
                      <Badge className={regimeColor(e.marketRegime)}>{e.marketRegime}</Badge>
                    </td>
                    <td className={`py-2 pr-3 ${strategyColor(e.selectedStrategy)}`}>{strategyShort(e.selectedStrategy)}</td>
                    <td className="mono py-2 pr-3 uppercase">{e.direction === "flat" ? "—" : e.direction}</td>
                    <td className="mono py-2 pr-3 text-right">{e.positionSizePct ? `${e.positionSizePct}%` : "—"}</td>
                    <td
                      className={`mono py-2 pr-3 text-right ${
                        e.pnlPct === null ? "text-muted" : e.pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {pctStr(e.pnlPct)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {e.status === "closed" ? e.exitReason.replace("_", " ") : e.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-sm text-muted">
            Ledger is empty. Click <span className="text-cyan-300">Run backtest seed</span> to populate it.
          </div>
        )}
      </Panel>
    </div>
  );
}
