import type { AssetSymbol, MarketSnapshot } from "@/lib/types";
import { ASSET_SYMBOLS } from "@/lib/types";
import { crowdScore, fairValueGapPct } from "@/lib/scores";
import { buildAssetData, randomScenario } from "@/lib/market/generator";
import { hashSeed, mulberry32, rngInt } from "@/lib/util/rng";
import { addMinutes } from "@/lib/util/time";
import { round } from "@/lib/util/num";

// Signal Zoo — our honest adaptation of Vibe-Trading's Alpha Zoo. Instead of
// importing 456 formulaic alphas, we catalog the named signals the engine
// actually uses, then BENCHMARK each one's predictive power with a real
// information coefficient (IC): the correlation between the signal's value at
// decision time and the token's realized forward return, measured over a
// reproducible instrumented backtest. No fake precision — IC magnitudes are
// modest because the market is noisy, and we say so.

export type SignalCategory = "Momentum" | "Value" | "Crowding" | "Liquidity" | "Macro";

export interface SignalDef {
  key: string;
  label: string;
  category: SignalCategory;
  formula: string;
  compute: (s: MarketSnapshot) => number;
}

export const SIGNALS: SignalDef[] = [
  { key: "momentum", label: "Momentum (velocity)", category: "Momentum", formula: "recent price velocity %", compute: (s) => s.priceVelocityPct },
  { key: "reversion", label: "Mean-reversion pressure", category: "Value", formula: "−velocity × crowd", compute: (s) => -s.priceVelocityPct * (crowdScore(s).score / 100) },
  { key: "fvgap", label: "Fair-value gap", category: "Value", formula: "(token − fair) / fair", compute: (s) => fairValueGapPct(s) },
  { key: "gapmag", label: "Gap magnitude", category: "Value", formula: "|fair-value gap|", compute: (s) => Math.abs(fairValueGapPct(s)) },
  { key: "volspike", label: "Volume spike", category: "Liquidity", formula: "volume / avg volume", compute: (s) => (s.avgVolume ? s.volume / s.avgVolume : 1) },
  { key: "volatility", label: "Volatility", category: "Liquidity", formula: "realized volatility %", compute: (s) => s.volatilityPct },
  { key: "spread", label: "Spread", category: "Liquidity", formula: "bid/ask spread %", compute: (s) => s.spreadPct },
  { key: "crowd", label: "CrowdScore", category: "Crowding", formula: "composite crowd 0–100", compute: (s) => crowdScore(s).score },
  { key: "hype", label: "Social hype", category: "Crowding", formula: "social spike 0–1", compute: (s) => s.socialHypeSpike },
  { key: "evidence_gap", label: "Evidence gap", category: "Crowding", formula: "intensity × (1 − evidence)", compute: (s) => s.newsIntensity * (1 - s.newsEvidenceQuality) },
  { key: "sector_div", label: "Sector divergence", category: "Macro", formula: "velocity − sector move", compute: (s) => s.priceVelocityPct - s.sectorIndexChangePct },
  { key: "futures_basis", label: "Nasdaq futures", category: "Macro", formula: "NQ futures change %", compute: (s) => s.nasdaqFuturesChangePct },
  { key: "sentiment", label: "News sentiment", category: "Crowding", formula: "sentiment −1..1", compute: (s) => s.newsSentiment },
];

export type SignalVerdict = "predictive" | "weak" | "noise";

export interface SignalBenchRow {
  key: string;
  label: string;
  category: SignalCategory;
  formula: string;
  ic: number; // information coefficient (Pearson corr vs forward return)
  direction: "with-return" | "against-return" | "flat";
  verdict: SignalVerdict;
  samples: number;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function verdictOf(ic: number): SignalVerdict {
  const a = Math.abs(ic);
  if (a >= 0.06) return "predictive";
  if (a >= 0.03) return "weak";
  return "noise";
}

export interface SignalBench {
  rows: SignalBenchRow[];
  samples: number;
  seed: string;
}

/** Instrumented backtest: for each decision record every signal value and the
 *  token's realized forward return, then compute each signal's IC. Reproducible. */
export function benchSignals(samplesTarget = 400, seed = "signal-zoo"): SignalBench {
  const rng = mulberry32(hashSeed(seed));
  const startTime = "2026-03-03T00:00:00.000Z";
  const stepMinutes = 8 * 60;

  const values: Record<string, number[]> = {};
  for (const s of SIGNALS) values[s.key] = [];
  const forwardReturns: number[] = [];

  for (let i = 0; i < samplesTarget; i++) {
    const timestamp = addMinutes(startTime, i * stepMinutes);
    const symbol: AssetSymbol = ASSET_SYMBOLS[rngInt(rng, 0, ASSET_SYMBOLS.length - 1)];
    const spec = randomScenario(rng);
    const md = buildAssetData(symbol, spec, timestamp, rng);
    const s = md.snapshot;
    const path = md.forwardPath;
    if (path.length === 0) continue;
    const fwd = ((path[path.length - 1].price - s.tokenPrice) / s.tokenPrice) * 100;
    forwardReturns.push(fwd);
    for (const sig of SIGNALS) values[sig.key].push(sig.compute(s));
  }

  const rows: SignalBenchRow[] = SIGNALS.map((sig) => {
    const ic = round(pearson(values[sig.key], forwardReturns), 3);
    const direction: SignalBenchRow["direction"] =
      ic > 0.01 ? "with-return" : ic < -0.01 ? "against-return" : "flat";
    return {
      key: sig.key,
      label: sig.label,
      category: sig.category,
      formula: sig.formula,
      ic,
      direction,
      verdict: verdictOf(ic),
      samples: forwardReturns.length,
    };
  }).sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));

  return { rows, samples: forwardReturns.length, seed };
}

export function currentSignalValues(
  snapshots: MarketSnapshot[],
): { key: string; label: string; values: Record<string, number> }[] {
  return SIGNALS.map((sig) => {
    const values: Record<string, number> = {};
    for (const s of snapshots) values[s.symbol] = round(sig.compute(s), 2);
    return { key: sig.key, label: sig.label, values };
  });
}
