import type {
  LedgerEntry,
  LedgerStats,
  Regime,
  Strategy,
  StrategyMemory,
  StrategyMemoryRow,
} from "@/lib/types";
import { REGIMES, STRATEGIES } from "@/lib/types";
import { clamp, round } from "@/lib/util/num";

// Strategy Performance Memory (PRD §17) + autopilot allocation (PRD §35) +
// aggregate ledger stats (PRD §16.3). All derived from the closed paper trades —
// nothing hand-tuned, so the numbers always match the ledger on disk.

function isClosed(e: LedgerEntry): boolean {
  return e.status === "closed" && e.pnlPct !== null;
}

function bestWorstRegime(entries: LedgerEntry[]): {
  best: Regime | null;
  worst: Regime | null;
} {
  const byRegime = new Map<Regime, number[]>();
  for (const e of entries) {
    if (!isClosed(e)) continue;
    const arr = byRegime.get(e.marketRegime) ?? [];
    arr.push(e.pnlPct as number);
    byRegime.set(e.marketRegime, arr);
  }
  let best: Regime | null = null;
  let worst: Regime | null = null;
  let bestAvg = -Infinity;
  let worstAvg = Infinity;
  for (const [regime, rs] of byRegime) {
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = regime;
    }
    if (avg < worstAvg) {
      worstAvg = avg;
      worst = regime;
    }
  }
  return { best, worst };
}

function strategyRow(strategy: Strategy, entries: LedgerEntry[]): Omit<StrategyMemoryRow, "currentWeight"> {
  const own = entries.filter((e) => e.selectedStrategy === strategy);

  if (strategy === "No-Trade / Risk-Off") {
    return {
      strategy,
      trades: own.length,
      wins: 0,
      losses: 0,
      winRate: null,
      avgReturnPct: null,
      bestRegime: null,
      worstRegime: null,
    };
  }

  const closed = own.filter(isClosed);
  const wins = closed.filter((e) => (e.pnlPct as number) > 0).length;
  const losses = closed.length - wins;
  const winRate = closed.length ? round(wins / closed.length, 3) : null;
  const avgReturnPct = closed.length
    ? round(closed.reduce((a, e) => a + (e.pnlPct as number), 0) / closed.length, 3)
    : null;
  const { best, worst } = bestWorstRegime(closed);

  return {
    strategy,
    trades: closed.length,
    wins,
    losses,
    winRate,
    avgReturnPct,
    bestRegime: best,
    worstRegime: worst,
  };
}

function autopilotWeights(rows: Omit<StrategyMemoryRow, "currentWeight">[]): Record<Strategy, number> {
  // Reserve a cash floor for No-Trade / Risk-Off; allocate the rest across active
  // strategies by a performance score = winRate * (1 + avgReturn/2), floored so a
  // cold strategy still keeps a probe allocation.
  const CASH_FLOOR = 15;
  const active = rows.filter((r) => r.strategy !== "No-Trade / Risk-Off");
  const scores = new Map<Strategy, number>();
  for (const r of active) {
    const wr = r.winRate ?? 0.5;
    const ar = r.avgReturnPct ?? 0;
    const score = Math.max(0.05, wr * (1 + clamp(ar, -1, 1) / 2));
    scores.set(r.strategy, score);
  }
  const totalScore = [...scores.values()].reduce((a, b) => a + b, 0) || 1;

  const weights = {} as Record<Strategy, number>;
  let allocated = 0;
  for (const r of active) {
    const w = round(((scores.get(r.strategy) as number) / totalScore) * (100 - CASH_FLOOR), 0);
    weights[r.strategy] = w;
    allocated += w;
  }
  weights["No-Trade / Risk-Off"] = Math.max(0, 100 - allocated);
  return weights;
}

export function computeStrategyMemory(entries: LedgerEntry[]): StrategyMemory {
  const baseRows = STRATEGIES.map((s) => strategyRow(s, entries));
  const weights = autopilotWeights(baseRows);
  const rows: StrategyMemoryRow[] = baseRows.map((r) => ({
    ...r,
    currentWeight: weights[r.strategy],
  }));
  const totalClosed = entries.filter(isClosed).length;
  return { rows, totalClosed, generatedAt: new Date().toISOString() };
}

function maxDrawdownPct(closed: LedgerEntry[]): number {
  const sorted = [...closed].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const e of sorted) {
    equity += e.pnlValue as number;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  return round(maxDd, 3);
}

export function computeLedgerStats(entries: LedgerEntry[]): LedgerStats {
  const noTrades = entries.filter((e) => e.status === "no_trade").length;
  const executed = entries.filter((e) => e.status !== "no_trade");
  const closed = entries.filter(isClosed);
  const openTrades = entries.filter((e) => e.status === "open").length;
  const wins = closed.filter((e) => (e.pnlPct as number) > 0).length;
  const losses = closed.length - wins;

  const winRate = closed.length ? round(wins / closed.length, 3) : null;
  const avgReturnPct = closed.length
    ? round(closed.reduce((a, e) => a + (e.pnlPct as number), 0) / closed.length, 3)
    : null;
  const totalPnlValue = round(
    closed.reduce((a, e) => a + (e.pnlValue as number), 0),
    4,
  );

  // Risk-adjusted metrics over per-trade returns.
  const returns = closed.map((e) => e.pnlPct as number);
  let sharpe: number | null = null;
  let sortino: number | null = null;
  let profitFactor: number | null = null;
  let bestTradePct: number | null = null;
  let worstTradePct: number | null = null;
  if (returns.length > 0) {
    const m = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sd = Math.sqrt(returns.reduce((a, b) => a + (b - m) ** 2, 0) / returns.length);
    const downside = Math.sqrt(
      returns.reduce((a, b) => a + (b < 0 ? b * b : 0), 0) / returns.length,
    );
    const grossWin = returns.filter((r) => r > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(returns.filter((r) => r < 0).reduce((a, b) => a + b, 0));
    sharpe = sd > 0 ? round(m / sd, 3) : null;
    sortino = downside > 0 ? round(m / downside, 3) : null;
    profitFactor = grossLoss > 0 ? round(grossWin / grossLoss, 2) : null;
    bestTradePct = round(Math.max(...returns), 3);
    worstTradePct = round(Math.min(...returns), 3);
  }

  const byStrategy = computeStrategyMemory(entries).rows;

  const byRegime = REGIMES.map((regime) => {
    const rs = closed.filter((e) => e.marketRegime === regime);
    const w = rs.filter((e) => (e.pnlPct as number) > 0).length;
    return {
      regime,
      trades: rs.length,
      winRate: rs.length ? round(w / rs.length, 3) : null,
      avgReturnPct: rs.length
        ? round(rs.reduce((a, e) => a + (e.pnlPct as number), 0) / rs.length, 3)
        : null,
    };
  }).filter((r) => r.trades > 0);

  return {
    totalDecisions: entries.length,
    totalTrades: executed.length,
    closedTrades: closed.length,
    openTrades,
    noTrades,
    wins,
    losses,
    winRate,
    avgReturnPct,
    totalPnlValue,
    maxDrawdownPct: maxDrawdownPct(closed),
    sharpe,
    sortino,
    profitFactor,
    bestTradePct,
    worstTradePct,
    byStrategy,
    byRegime,
  };
}
