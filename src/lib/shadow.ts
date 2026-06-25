import type { AssetSymbol, Direction, LedgerEntry } from "@/lib/types";
import { ASSET_SYMBOLS } from "@/lib/types";
import { buildAssetData, randomScenario } from "@/lib/market/generator";
import { resolveTrade, type ExecutionPlan } from "@/lib/executor";
import { hashSeed, mulberry32, rngInt } from "@/lib/util/rng";
import { addMinutes } from "@/lib/util/time";
import { round } from "@/lib/util/num";

// Decision Shadow — our adaptation of Vibe-Trading's Shadow Account. Instead of
// parsing a user's broker journal, we run behavioral diagnostics on the agent's
// OWN paper ledger, and shadow it against naive baselines on the identical
// market. The point: show whether the strategy router actually adds value over
// trading everything blindly — honestly, even if the edge is thin.

export interface ConfidenceBand {
  band: string;
  trades: number;
  winRate: number | null;
  avgReturnPct: number | null;
}

export interface Diagnostics {
  totalDecisions: number;
  executed: number;
  noTrades: number;
  noTradeRatePct: number;
  avgHoldMinutes: number | null;
  exitMix: { takeProfit: number; stopLoss: number; timeLimit: number };
  byConfidence: ConfidenceBand[];
  flags: string[];
}

function isClosed(e: LedgerEntry): boolean {
  return e.status === "closed" && e.pnlPct !== null;
}

export function computeDiagnostics(entries: LedgerEntry[]): Diagnostics {
  const executed = entries.filter((e) => e.status !== "no_trade");
  const noTrades = entries.filter((e) => e.status === "no_trade").length;
  const closed = entries.filter(isClosed);

  const holds = closed.map((e) => e.holdMinutes ?? 0).filter((h) => h > 0);
  const avgHoldMinutes = holds.length ? Math.round(holds.reduce((a, b) => a + b, 0) / holds.length) : null;

  const exits = { take_profit: 0, stop_loss: 0, time_limit: 0 } as Record<string, number>;
  for (const e of closed) exits[e.exitReason] = (exits[e.exitReason] ?? 0) + 1;
  const total = closed.length || 1;
  const exitMix = {
    takeProfit: round((exits.take_profit / total) * 100, 0),
    stopLoss: round((exits.stop_loss / total) * 100, 0),
    timeLimit: round((exits.time_limit / total) * 100, 0),
  };

  const bands: { label: string; lo: number; hi: number }[] = [
    { label: "< 60%", lo: 0, hi: 0.6 },
    { label: "60–75%", lo: 0.6, hi: 0.75 },
    { label: "≥ 75%", lo: 0.75, hi: 1.01 },
  ];
  const byConfidence: ConfidenceBand[] = bands.map((b) => {
    const rs = closed.filter((e) => e.strategyConfidence >= b.lo && e.strategyConfidence < b.hi);
    const wins = rs.filter((e) => (e.pnlPct as number) > 0).length;
    return {
      band: b.label,
      trades: rs.length,
      winRate: rs.length ? round(wins / rs.length, 3) : null,
      avgReturnPct: rs.length ? round(rs.reduce((a, e) => a + (e.pnlPct as number), 0) / rs.length, 3) : null,
    };
  });

  const flags: string[] = [];
  const noTradeRatePct = round((noTrades / (entries.length || 1)) * 100, 0);
  flags.push(`Stands aside on ${noTradeRatePct}% of decisions — discipline over overtrading.`);

  const hi = byConfidence.find((b) => b.band === "≥ 75%");
  const lo = byConfidence.find((b) => b.band === "< 60%");
  if (hi?.winRate != null && lo?.winRate != null) {
    if (hi.winRate >= lo.winRate) {
      flags.push(`Confidence is calibrated: high-confidence trades win ${(hi.winRate * 100).toFixed(0)}% vs ${(lo.winRate * 100).toFixed(0)}% for low-confidence.`);
    } else {
      flags.push(`Warning: low-confidence trades outperformed high-confidence ones — confidence may be miscalibrated this run.`);
    }
  }
  if (exitMix.stopLoss > exitMix.takeProfit + 25) {
    flags.push(`Stop-outs (${exitMix.stopLoss}%) exceed take-profits (${exitMix.takeProfit}%) — most edge comes from time-limit exits.`);
  }
  return {
    totalDecisions: entries.length,
    executed: executed.length,
    noTrades,
    noTradeRatePct,
    avgHoldMinutes,
    exitMix,
    byConfidence,
    flags,
  };
}

// --- Naive baselines on the identical market -----------------------------

export interface BaselineResult {
  name: string;
  description: string;
  trades: number;
  winRate: number | null;
  avgReturnPct: number | null;
  totalPnlPct: number;
}

function summarize(name: string, description: string, returns: number[]): BaselineResult {
  const wins = returns.filter((r) => r > 0).length;
  return {
    name,
    description,
    trades: returns.length,
    winRate: returns.length ? round(wins / returns.length, 3) : null,
    avgReturnPct: returns.length ? round(returns.reduce((a, b) => a + b, 0) / returns.length, 3) : null,
    totalPnlPct: round(returns.reduce((a, b) => a + b, 0), 2),
  };
}

export function computeBaselines(decisions = 480, seed = "counterflow-backtest"): BaselineResult[] {
  const rng = mulberry32(hashSeed(seed));
  const rngRand = mulberry32(hashSeed(seed + ":shadow"));
  const startTime = "2026-03-03T00:00:00.000Z";
  const stepMinutes = 12 * 60;

  const momentum: number[] = [];
  const buyHold: number[] = [];
  const random: number[] = [];

  for (let i = 0; i < decisions; i++) {
    const timestamp = addMinutes(startTime, i * stepMinutes);
    const symbol: AssetSymbol = ASSET_SYMBOLS[rngInt(rng, 0, ASSET_SYMBOLS.length - 1)];
    const spec = randomScenario(rng);
    const md = buildAssetData(symbol, spec, timestamp, rng);
    const s = md.snapshot;
    if (md.forwardPath.length === 0) continue;
    const cost = round(s.spreadPct + 0.05, 3);

    const plan = (dir: Direction): ExecutionPlan => ({
      direction: dir,
      entryPrice: s.tokenPrice,
      entryTime: s.timestamp,
      stopLossPct: 1.5,
      takeProfitPct: 3.0,
      positionSizePct: 8,
      costPct: cost,
    });

    momentum.push(resolveTrade(plan(s.priceVelocityPct >= 0 ? "long" : "short"), md.forwardPath).pnlPct ?? 0);
    buyHold.push(resolveTrade(plan("long"), md.forwardPath).pnlPct ?? 0);
    random.push(resolveTrade(plan(rngRand() < 0.5 ? "long" : "short"), md.forwardPath).pnlPct ?? 0);
  }

  return [
    summarize("Always Momentum", "Follow velocity on every decision", momentum),
    summarize("Buy & Hold", "Always long every asset", buyHold),
    summarize("Random", "Coin-flip long/short", random),
  ];
}
