import type { AssetSymbol, LedgerEntry } from "@/lib/types";
import { ASSET_SYMBOLS } from "@/lib/types";
import { buildAssetData, randomScenario } from "@/lib/market/generator";
import { scanAsset } from "@/lib/pipeline";
import { hashSeed, mulberry32, rngInt } from "@/lib/util/rng";
import { addMinutes } from "@/lib/util/time";

// Backtest seed runner. Produces a reproducible history of paper decisions across
// regimes so the ledger, win rates, and Strategy Performance Memory are populated
// with honest, mixed results (PRD §19 "should have: backtest"; §17 memory).
// Deterministic: same seed -> same ledger. No LLM calls here (conserves tokens
// and keeps the run fast); rationales use the deterministic narrator.

export interface BacktestOptions {
  decisions?: number;
  seed?: string;
  startTime?: string; // ISO; default ~3.5 months before the demo date
  stepMinutes?: number;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function runBacktest(opts: BacktestOptions = {}): Promise<LedgerEntry[]> {
  const decisions = opts.decisions ?? 480;
  const seed = opts.seed ?? "counterflow-backtest";
  const startTime = opts.startTime ?? "2026-03-03T00:00:00.000Z";
  const stepMinutes = opts.stepMinutes ?? 12 * 60; // every 12h

  const rng = mulberry32(hashSeed(seed));
  const entries: LedgerEntry[] = [];

  let equity = 0; // cumulative portfolio-% return
  let dayStartEquity = 0;
  let currentDay = dayKey(startTime);

  for (let i = 0; i < decisions; i++) {
    const timestamp = addMinutes(startTime, i * stepMinutes);
    const day = dayKey(timestamp);
    if (day !== currentDay) {
      currentDay = day;
      dayStartEquity = equity;
    }

    const symbol: AssetSymbol = ASSET_SYMBOLS[rngInt(rng, 0, ASSET_SYMBOLS.length - 1)];
    const spec = randomScenario(rng);
    const market = buildAssetData(symbol, spec, timestamp, rng);

    const dailyDrawdownPct = Math.min(0, equity - dayStartEquity);
    const year = new Date(timestamp).getUTCFullYear();
    const decisionId = `cfos_${year}_${String(i + 1).padStart(4, "0")}`;

    const { ledgerEntry } = await scanAsset(market, {
      decisionId,
      useLLM: false,
      portfolioExposurePct: 0,
      dailyDrawdownPct,
    });

    if (ledgerEntry.status === "closed" && ledgerEntry.pnlValue !== null) {
      equity += ledgerEntry.pnlValue;
    }
    entries.push(ledgerEntry);
  }

  return entries;
}
