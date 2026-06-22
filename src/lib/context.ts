import type { MarketSnapshot } from "@/lib/types";
import {
  crowdScore,
  fairValueGapPct,
  liquidityScore,
  riskScore,
  type CrowdScoreResult,
  type LiquidityResult,
  type RiskScoreResult,
} from "@/lib/scores";
import { detectRegime, type RegimeDetail } from "@/lib/regime";

// Everything the engine derives from a raw snapshot, computed once and shared by
// the council, router, risk governor, and packet builder. Single source of truth.

export interface Signals {
  snapshot: MarketSnapshot;
  gapPct: number;
  crowd: CrowdScoreResult;
  liquidity: LiquidityResult;
  risk: RiskScoreResult;
  regime: RegimeDetail;
}

export function computeSignals(s: MarketSnapshot): Signals {
  const gapPct = fairValueGapPct(s);
  const crowd = crowdScore(s);
  const liquidity = liquidityScore(s);
  const risk = riskScore(s, crowd.score);
  const regime = detectRegime(s, crowd.score, liquidity.score);
  return { snapshot: s, gapPct, crowd, liquidity, risk, regime };
}
