import type { MarketSnapshot } from "@/lib/types";
import { clamp01, mapRange, round } from "@/lib/util/num";

// Proprietary scores (PRD §12). Every score is a transparent weighted blend of
// named components — the breakdown travels with the decision so a judge can see
// exactly why a number is what it is. RegimeConfidence lives in regime.ts and
// StrategyConfidence in router.ts because they depend on detection / agreement.

export interface ScoreComponent {
  label: string;
  value: number; // normalized 0..100 (crowd) or 0..1
  weight: number;
}

export interface CrowdScoreResult {
  score: number; // 0..100
  band: "Clean" | "Mixed" | "Crowded" | "Extreme";
  components: ScoreComponent[];
}

function volMultiplier(s: MarketSnapshot): number {
  return s.avgVolume > 0 ? s.volume / s.avgVolume : 1;
}

// --- FairValueGap (PRD §12.2) ----------------------------------------------

export function fairValueGapPct(s: MarketSnapshot): number {
  if (s.estimatedFairValue === 0) return 0;
  return round(
    ((s.tokenPrice - s.estimatedFairValue) / s.estimatedFairValue) * 100,
    2,
  );
}

// --- CrowdScore (PRD §12.1) -------------------------------------------------
// Likelihood a move is crowded / bot-driven / overreactive. High when hype and
// price action run ahead of evidence and cross-market confirmation.

export function crowdScore(s: MarketSnapshot): CrowdScoreResult {
  const gap = Math.abs(fairValueGapPct(s));
  const vm = volMultiplier(s);

  const components: ScoreComponent[] = [
    { label: "Social / hype spike", value: round(s.socialHypeSpike * 100, 1), weight: 0.18 },
    { label: "Price velocity", value: round(mapRange(Math.abs(s.priceVelocityPct), 0, 5, 0, 100), 1), weight: 0.12 },
    { label: "Volume spike", value: round(mapRange(vm, 1, 3.5, 0, 100), 1), weight: 0.12 },
    { label: "Token-vs-fair-value gap", value: round(mapRange(gap, 0, 4, 0, 100), 1), weight: 0.16 },
    { label: "Spread widening", value: round(mapRange(s.spreadPct, 0.1, 0.6, 0, 100), 1), weight: 0.1 },
    { label: "Weak sector confirmation", value: round((1 - s.sectorConfirmation) * 100, 1), weight: 0.16 },
    { label: "Weak news evidence", value: round((1 - s.newsEvidenceQuality) * 100, 1), weight: 0.1 },
    { label: "News intensity", value: round(s.newsIntensity * 100, 1), weight: 0.06 },
  ];

  const score = round(
    components.reduce((acc, c) => acc + c.value * c.weight, 0),
    0,
  );

  let band: CrowdScoreResult["band"] = "Clean";
  if (score >= 80) band = "Extreme";
  else if (score >= 60) band = "Crowded";
  else if (score >= 30) band = "Mixed";

  return { score, band, components };
}

// --- LiquidityScore (PRD §13.6 inputs) -------------------------------------
// 0..1, higher = more tradable. Spread, depth (volume), volatility, freshness.

export interface LiquidityResult {
  score: number; // 0..1
  status: "tradable" | "thin" | "untradable";
  slippageEstimatePct: number;
  components: ScoreComponent[];
}

export function liquidityScore(s: MarketSnapshot): LiquidityResult {
  const vm = volMultiplier(s);
  const components: ScoreComponent[] = [
    { label: "Spread", value: round(mapRange(s.spreadPct, 0.1, 0.6, 1, 0), 3), weight: 0.4 },
    { label: "Depth (volume)", value: round(mapRange(vm, 0.4, 2.0, 0.2, 1), 3), weight: 0.3 },
    { label: "Volatility", value: round(mapRange(s.volatilityPct, 1, 6, 1, 0.3), 3), weight: 0.15 },
    { label: "Data freshness", value: round(mapRange(s.dataFreshnessSec, 30, 240, 1, 0.3), 3), weight: 0.15 },
  ];
  const score = round(
    clamp01(components.reduce((acc, c) => acc + c.value * c.weight, 0)),
    3,
  );

  let status: LiquidityResult["status"] = "tradable";
  if (score < 0.35) status = "untradable";
  else if (score < 0.55) status = "thin";

  // Rough slippage proxy: half-spread plus a volatility/depth penalty.
  const slippageEstimatePct = round(
    s.spreadPct / 2 + (1 - score) * 0.15 + Math.max(0, s.volatilityPct - 2) * 0.02,
    3,
  );

  return { score, status, slippageEstimatePct, components };
}

// --- RiskScore (feeds Risk Governor & autopilot) ---------------------------
// 0..1, higher = riskier environment for taking a position.

export interface RiskScoreResult {
  score: number; // 0..1
  components: ScoreComponent[];
}

export function riskScore(s: MarketSnapshot, crowd: number): RiskScoreResult {
  const components: ScoreComponent[] = [
    { label: "Volatility", value: round(mapRange(s.volatilityPct, 1, 6, 0, 1), 3), weight: 0.3 },
    { label: "Spread", value: round(mapRange(s.spreadPct, 0.1, 0.6, 0, 1), 3), weight: 0.2 },
    {
      label: "Event risk",
      value: round(clamp01((s.macroEventActive ? 0.6 : 0) + (s.earningsEventActive ? 0.45 : 0)), 3),
      weight: 0.25,
    },
    { label: "Crowding", value: round(crowd / 100, 3), weight: 0.15 },
    { label: "Data staleness", value: round(mapRange(s.dataFreshnessSec, 30, 240, 0, 1), 3), weight: 0.1 },
  ];
  const score = round(
    clamp01(components.reduce((acc, c) => acc + c.value * c.weight, 0)),
    3,
  );
  return { score, components };
}
