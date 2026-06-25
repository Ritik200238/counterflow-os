import type {
  AssetMarketData,
  AssetSymbol,
  MarketSnapshot,
  PricePoint,
  Regime,
} from "@/lib/types";
import { ASSETS, assetMeta, type AssetBase } from "@/lib/market/assets";
import {
  hashSeed,
  mulberry32,
  rngGauss,
  rngPick,
  rngRange,
  type Rng,
} from "@/lib/util/rng";
import { round } from "@/lib/util/num";
import { addMinutes, isUsMarketOpen } from "@/lib/util/time";

// A market is generated from a seed so it is fully reproducible. Each scenario
// describes the *shape* of a regime; the engine still detects the regime
// independently from the resulting snapshot (we never hand it the answer).

export type ScenarioKind =
  | "cleanTrend"
  | "crowdedHype"
  | "fairValueGap"
  | "macroShock"
  | "earnings"
  | "breakout"
  | "noise";

export interface ScenarioSpec {
  kind: ScenarioKind;
  regimeHint: Regime;
  gapPct: number; // token vs fair value, signed
  velocityPct: number; // recent move, signed
  sectorConfirmation: number; // 0..1
  sectorIndexChangePct: number;
  nasdaqFuturesChangePct: number;
  newsIntensity: number;
  newsSentiment: number; // -1..1
  newsEvidenceQuality: number; // 0..1
  socialHypeSpike: number; // 0..1
  spreadPct: number;
  volMult: number; // volume vs avg
  volatilityPct: number;
  macroEventActive: boolean;
  macroEventLabel?: string;
  earningsEventActive: boolean;
  earningsEventLabel?: string;
  yieldsChangeBps: number;
  dxyChangePct: number;
  dataFreshnessSec: number;
  forwardDriftPct: number; // expected token move over the resolution horizon, signed
  forwardVolPct: number;
}

const MACRO_EVENTS = [
  "FOMC rate decision",
  "CPI inflation print",
  "Fed Chair testimony",
  "Nonfarm payrolls",
  "Geopolitical risk headline",
];

const EARNINGS_EVENTS = [
  "Q2 earnings + guidance",
  "earnings call transcript",
  "analyst estimate revision",
  "pre-market earnings reaction",
];

// Honest edge model. A strategy does NOT win every time its regime appears — the
// forward path goes the favorable way only with probability `pWin`. This keeps
// backtested win rates in a believable range instead of looking overfit.
// `winSign` is the favorable token-price direction (+1 up for longs, -1 down for
// short/convergence-overvalued setups). The resulting win rate lands a little
// below pWin once stops, noise, and costs are applied.
function edgeDrift(
  rng: Rng,
  pWin: number,
  winLo: number,
  winHi: number,
  loseLo: number,
  loseHi: number,
  winSign: number,
): number {
  return rng() < pWin
    ? winSign * rngRange(rng, winLo, winHi)
    : -winSign * rngRange(rng, loseLo, loseHi);
}

// --- Scenario presets -------------------------------------------------------

function cleanTrend(rng: Rng): ScenarioSpec {
  return {
    kind: "cleanTrend",
    regimeHint: "Clean Trend",
    gapPct: rngRange(rng, 0.1, 0.8),
    velocityPct: rngRange(rng, 1.6, 3.6),
    sectorConfirmation: rngRange(rng, 0.72, 0.95),
    sectorIndexChangePct: rngRange(rng, 0.8, 1.8),
    nasdaqFuturesChangePct: rngRange(rng, 0.4, 1.0),
    newsIntensity: rngRange(rng, 0.4, 0.7),
    newsSentiment: rngRange(rng, 0.45, 0.85),
    newsEvidenceQuality: rngRange(rng, 0.62, 0.9),
    socialHypeSpike: rngRange(rng, 0.1, 0.4),
    spreadPct: rngRange(rng, 0.08, 0.18),
    volMult: rngRange(rng, 1.1, 1.8),
    volatilityPct: rngRange(rng, 1.0, 2.2),
    macroEventActive: false,
    earningsEventActive: false,
    yieldsChangeBps: rngRange(rng, -3, 3),
    dxyChangePct: rngRange(rng, -0.2, 0.2),
    dataFreshnessSec: rngRange(rng, 10, 60),
    // Momentum follow: long, wins ~61% of the time.
    forwardDriftPct: edgeDrift(rng, 0.61, 1.2, 3.0, 0.8, 2.2, 1),
    forwardVolPct: 1.4,
  };
}

function crowdedHype(rng: Rng): ScenarioSpec {
  return {
    kind: "crowdedHype",
    regimeHint: "Crowded Hype",
    gapPct: rngRange(rng, 2.2, 4.0),
    velocityPct: rngRange(rng, 2.6, 5.2),
    sectorConfirmation: rngRange(rng, 0.1, 0.35),
    sectorIndexChangePct: rngRange(rng, -0.3, 0.5),
    nasdaqFuturesChangePct: rngRange(rng, -0.3, 0.3),
    newsIntensity: rngRange(rng, 0.78, 0.98),
    newsSentiment: rngRange(rng, 0.45, 0.92),
    newsEvidenceQuality: rngRange(rng, 0.15, 0.4),
    socialHypeSpike: rngRange(rng, 0.72, 0.98),
    spreadPct: rngRange(rng, 0.26, 0.6),
    volMult: rngRange(rng, 1.8, 3.6),
    volatilityPct: rngRange(rng, 2.6, 5.0),
    macroEventActive: false,
    earningsEventActive: false,
    yieldsChangeBps: rngRange(rng, -4, 4),
    dxyChangePct: rngRange(rng, -0.2, 0.3),
    dataFreshnessSec: rngRange(rng, 10, 70),
    // CounterFlow Fade: short the overreaction; mean-reverts ~70% of the time
    // (wide crowded-name spreads add real cost drag, so net win rate lands lower).
    // Lower path vol -> the tight 1.2% fade stop is whipsawed less.
    forwardDriftPct: edgeDrift(rng, 0.7, 1.6, 3.2, 0.6, 2.0, -1),
    forwardVolPct: 0.9,
  };
}

function fairValueGap(rng: Rng): ScenarioSpec {
  const gap = rngRange(rng, 2.0, 3.3); // overvalued (token rich) — converge downward
  return {
    kind: "fairValueGap",
    regimeHint: "Fair-Value Gap",
    gapPct: gap,
    velocityPct: rngRange(rng, -1.0, 1.0),
    sectorConfirmation: rngRange(rng, 0.4, 0.7),
    sectorIndexChangePct: rngRange(rng, -0.4, 0.4),
    nasdaqFuturesChangePct: rngRange(rng, -0.3, 0.3),
    newsIntensity: rngRange(rng, 0.08, 0.34), // nothing explains the gap
    newsSentiment: rngRange(rng, -0.2, 0.2),
    newsEvidenceQuality: rngRange(rng, 0.3, 0.6),
    socialHypeSpike: rngRange(rng, 0.1, 0.4),
    spreadPct: rngRange(rng, 0.1, 0.24),
    volMult: rngRange(rng, 0.8, 1.4),
    volatilityPct: rngRange(rng, 1.0, 2.0),
    macroEventActive: false,
    earningsEventActive: false,
    yieldsChangeBps: rngRange(rng, -3, 3),
    dxyChangePct: rngRange(rng, -0.2, 0.2),
    dataFreshnessSec: rngRange(rng, 10, 50),
    // Fair-Value Convergence: gap closes (token rich -> drifts down) ~70% of the time.
    forwardDriftPct: edgeDrift(rng, 0.7, 1.0, 2.5, 0.5, 1.8, -1),
    forwardVolPct: 1.4,
  };
}

function macroShock(rng: Rng): ScenarioSpec {
  const dir = rng() < 0.7 ? -1 : 1; // shocks are risk-off more often
  return {
    kind: "macroShock",
    regimeHint: "Macro Shock",
    gapPct: rngRange(rng, -1.5, 1.5),
    velocityPct: dir * rngRange(rng, 1.5, 3.5),
    sectorConfirmation: rngRange(rng, 0.3, 0.6),
    sectorIndexChangePct: dir * rngRange(rng, 0.9, 2.6),
    nasdaqFuturesChangePct: dir * rngRange(rng, 1.0, 2.6),
    newsIntensity: rngRange(rng, 0.6, 0.92),
    newsSentiment: dir * rngRange(rng, 0.3, 0.7),
    newsEvidenceQuality: rngRange(rng, 0.55, 0.85),
    socialHypeSpike: rngRange(rng, 0.3, 0.6),
    spreadPct: rngRange(rng, 0.2, 0.45),
    volMult: rngRange(rng, 1.5, 3.0),
    volatilityPct: rngRange(rng, 3.0, 6.0),
    macroEventActive: true,
    macroEventLabel: rngPick(rng, MACRO_EVENTS),
    earningsEventActive: false,
    yieldsChangeBps: rngRange(rng, 8, 25),
    dxyChangePct: rngRange(rng, 0.4, 1.2),
    dataFreshnessSec: rngRange(rng, 10, 60),
    // Macro Rebalance follows the broad move; it continues ~60% of the time.
    forwardDriftPct: edgeDrift(rng, 0.6, 0.8, 2.5, 0.5, 2.0, dir),
    forwardVolPct: 1.4,
  };
}

function earnings(rng: Rng): ScenarioSpec {
  const dir = rng() < 0.55 ? 1 : -1;
  return {
    kind: "earnings",
    regimeHint: "Earnings Event",
    gapPct: dir * rngRange(rng, 0.5, 3.0),
    velocityPct: dir * rngRange(rng, 2.0, 6.0),
    sectorConfirmation: rngRange(rng, 0.3, 0.6),
    sectorIndexChangePct: rngRange(rng, -0.5, 0.6),
    nasdaqFuturesChangePct: rngRange(rng, -0.4, 0.4),
    newsIntensity: rngRange(rng, 0.8, 1.0),
    newsSentiment: dir * rngRange(rng, 0.4, 0.85),
    newsEvidenceQuality: rngRange(rng, 0.6, 0.9),
    socialHypeSpike: rngRange(rng, 0.4, 0.75),
    spreadPct: rngRange(rng, 0.2, 0.5),
    volMult: rngRange(rng, 2.0, 4.0),
    volatilityPct: rngRange(rng, 3.0, 7.0),
    macroEventActive: false,
    earningsEventActive: true,
    earningsEventLabel: rngPick(rng, EARNINGS_EVENTS),
    yieldsChangeBps: rngRange(rng, -4, 4),
    dxyChangePct: rngRange(rng, -0.2, 0.2),
    dataFreshnessSec: rngRange(rng, 10, 50),
    // Earnings Drift follows the post-event move; it drifts on ~60% of the time.
    forwardDriftPct: edgeDrift(rng, 0.6, 1.0, 3.0, 0.5, 2.0, dir),
    forwardVolPct: 1.4,
  };
}

function noise(rng: Rng): ScenarioSpec {
  return {
    kind: "noise",
    regimeHint: "Noise",
    gapPct: rngRange(rng, -0.6, 0.6),
    velocityPct: rngRange(rng, -0.8, 0.8),
    sectorConfirmation: rngRange(rng, 0.3, 0.6),
    sectorIndexChangePct: rngRange(rng, -0.5, 0.5),
    nasdaqFuturesChangePct: rngRange(rng, -0.4, 0.4),
    newsIntensity: rngRange(rng, 0.3, 0.6),
    newsSentiment: rngRange(rng, -0.25, 0.25),
    newsEvidenceQuality: rngRange(rng, 0.3, 0.5),
    socialHypeSpike: rngRange(rng, 0.2, 0.5),
    spreadPct: rngRange(rng, 0.32, 0.7), // wide / bad liquidity
    volMult: rngRange(rng, 0.4, 0.9), // thin
    volatilityPct: rngRange(rng, 1.5, 3.0),
    macroEventActive: false,
    earningsEventActive: false,
    yieldsChangeBps: rngRange(rng, -4, 4),
    dxyChangePct: rngRange(rng, -0.3, 0.3),
    dataFreshnessSec: rngRange(rng, 60, 240), // stale-ish
    forwardDriftPct: rngRange(rng, -1.4, 1.4),
    forwardVolPct: 2.2,
  };
}

function breakout(rng: Rng): ScenarioSpec {
  const dir = rng() < 0.6 ? 1 : -1;
  return {
    kind: "breakout",
    regimeHint: "Clean Trend",
    gapPct: rngRange(rng, 0.2, 1.0),
    velocityPct: dir * rngRange(rng, 3.6, 6.0),
    sectorConfirmation: rngRange(rng, 0.55, 0.85),
    sectorIndexChangePct: dir * rngRange(rng, 0.8, 2.0),
    nasdaqFuturesChangePct: dir * rngRange(rng, 0.3, 1.0),
    newsIntensity: rngRange(rng, 0.4, 0.7),
    newsSentiment: dir * rngRange(rng, 0.4, 0.8),
    newsEvidenceQuality: rngRange(rng, 0.5, 0.8),
    socialHypeSpike: rngRange(rng, 0.4, 0.6),
    spreadPct: rngRange(rng, 0.12, 0.28),
    volMult: rngRange(rng, 2.0, 3.5),
    volatilityPct: rngRange(rng, 3.0, 5.5),
    macroEventActive: false,
    earningsEventActive: false,
    yieldsChangeBps: rngRange(rng, -4, 4),
    dxyChangePct: rngRange(rng, -0.2, 0.2),
    dataFreshnessSec: rngRange(rng, 10, 50),
    // Volatility Breakout: breakouts follow through ~60% of the time.
    forwardDriftPct: edgeDrift(rng, 0.6, 1.5, 3.5, 0.6, 2.5, dir),
    forwardVolPct: 1.3,
  };
}

const PRESETS: Record<ScenarioKind, (rng: Rng) => ScenarioSpec> = {
  cleanTrend,
  crowdedHype,
  fairValueGap,
  macroShock,
  earnings,
  breakout,
  noise,
};

export function makeScenario(kind: ScenarioKind, rng: Rng): ScenarioSpec {
  return PRESETS[kind](rng);
}

// Pool used by the backtest seed runner — weighted toward the regimes the system
// is built for, with noise/macro mixed in so win rates stay honest.
const RANDOM_POOL: ScenarioKind[] = [
  "cleanTrend",
  "cleanTrend",
  "crowdedHype",
  "crowdedHype",
  "crowdedHype",
  "fairValueGap",
  "fairValueGap",
  "fairValueGap",
  "breakout",
  "breakout",
  "macroShock",
  "macroShock",
  "earnings",
  "earnings",
  "noise",
  "noise",
];

export function randomScenario(rng: Rng): ScenarioSpec {
  const kind = rngPick(rng, RANDOM_POOL);
  const spec = makeScenario(kind, rng);
  // Occasionally flip a fair-value gap to undervalued (token cheap -> converge up).
  if (kind === "fairValueGap" && rng() < 0.4) {
    spec.gapPct = -spec.gapPct;
    spec.forwardDriftPct = -spec.forwardDriftPct;
  }
  return spec;
}

// --- Snapshot + forward path assembly --------------------------------------

function buildForwardPath(
  rng: Rng,
  startPrice: number,
  startIso: string,
  driftPct: number,
  volPct: number,
  steps = 16,
  stepMinutes = 30,
): PricePoint[] {
  const path: PricePoint[] = [];
  let price = startPrice;
  const perStepDrift = driftPct / 100 / steps;
  const perStepVol = volPct / 100 / Math.sqrt(steps);
  for (let i = 1; i <= steps; i++) {
    const shock = rngGauss(rng, 0, perStepVol);
    price = price * (1 + perStepDrift + shock);
    path.push({ t: addMinutes(startIso, i * stepMinutes), price: round(price, 4) });
  }
  return path;
}

export function buildAssetData(
  symbol: AssetSymbol,
  spec: ScenarioSpec,
  timestamp: string,
  rng: Rng,
): AssetMarketData {
  const base: AssetBase = ASSETS[symbol];
  const marketOpen = isUsMarketOpen(new Date(timestamp));

  // Underlying price wanders a little around the base level.
  const underlyingPrice = round(
    base.basePrice * (1 + rngGauss(rng, 0, 0.01)),
    2,
  );

  // After hours, fair value leans on futures/proxies (the underlying tape is stale).
  const futuresAdj = marketOpen
    ? 0
    : (spec.nasdaqFuturesChangePct / 100) * base.beta * 0.5;
  const estimatedFairValue = round(underlyingPrice * (1 + futuresAdj), 2);

  const tokenPrice = round(estimatedFairValue * (1 + spec.gapPct / 100), 2);
  const avgVolume = base.baseVolume;
  const volume = Math.round(avgVolume * spec.volMult);

  const snapshot: MarketSnapshot = {
    symbol,
    timestamp,
    tokenPrice,
    estimatedFairValue,
    underlyingPrice,
    underlyingMarketOpen: marketOpen,
    spreadPct: round(spec.spreadPct, 3),
    volume,
    avgVolume,
    priceVelocityPct: round(spec.velocityPct, 2),
    volatilityPct: round(spec.volatilityPct, 2),
    sectorIndexChangePct: round(spec.sectorIndexChangePct, 2),
    sectorConfirmation: round(spec.sectorConfirmation, 2),
    nasdaqFuturesChangePct: round(spec.nasdaqFuturesChangePct, 2),
    newsIntensity: round(spec.newsIntensity, 2),
    newsSentiment: round(spec.newsSentiment, 2),
    newsEvidenceQuality: round(spec.newsEvidenceQuality, 2),
    socialHypeSpike: round(spec.socialHypeSpike, 2),
    macroEventActive: spec.macroEventActive,
    macroEventLabel: spec.macroEventLabel,
    earningsEventActive: spec.earningsEventActive,
    earningsEventLabel: spec.earningsEventLabel,
    yieldsChangeBps: round(spec.yieldsChangeBps, 1),
    dxyChangePct: round(spec.dxyChangePct, 2),
    dataFreshnessSec: Math.round(spec.dataFreshnessSec),
  };

  const forwardPath = buildForwardPath(
    rng,
    tokenPrice,
    timestamp,
    spec.forwardDriftPct,
    spec.forwardVolPct,
  );

  return { meta: assetMeta(symbol), snapshot, forwardPath };
}

// Signature regime per asset for the live demo board (PRD §16 dashboard intent).
const BOARD_SCENARIOS: Record<AssetSymbol, ScenarioKind> = {
  NVDAx: "cleanTrend",
  TSLAx: "crowdedHype",
  AAPLx: "noise",
  COINx: "fairValueGap",
  HOODx: "macroShock",
};

/** Default demo time: a weekend / overnight slot when US equities are CLOSED,
 *  to spotlight the 24/7-token vs limited-hours wedge. */
export const DEFAULT_BOARD_TIME = "2026-06-21T03:30:00.000Z"; // Sunday, US closed

export function generateBoard(
  seed = "counterflow-demo",
  timestamp = DEFAULT_BOARD_TIME,
): AssetMarketData[] {
  return (Object.keys(BOARD_SCENARIOS) as AssetSymbol[]).map((symbol) => {
    // Per-asset deterministic stream so adding/reordering assets is stable.
    const rng = mulberry32(hashSeed(`${seed}:${symbol}:${timestamp}`));
    const spec = makeScenario(BOARD_SCENARIOS[symbol], rng);
    return buildAssetData(symbol, spec, timestamp, rng);
  });
}
