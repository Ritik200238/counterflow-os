import type { MarketSnapshot, Regime, RegimeResult } from "@/lib/types";
import { REGIMES } from "@/lib/types";
import { clamp01, mapRange, mean, round } from "@/lib/util/num";
import { fairValueGapPct } from "@/lib/scores";

// Rule-based regime detection (PRD §10). Each regime is scored as the average of
// named, graded conditions in [0,1]. The winner is the regime with the highest
// fit; RegimeConfidence blends the fit, the margin over the runner-up, and data
// quality. Conditions whose strength clears 0.6 surface as human-readable signals.

interface Cond {
  label: string;
  strength: number;
}

function fitOf(conds: Cond[]): { score: number; signals: string[] } {
  const score = mean(conds.map((c) => clamp01(c.strength)));
  const signals = conds
    .filter((c) => clamp01(c.strength) >= 0.6)
    .map((c) => c.label);
  return { score: round(score, 3), signals };
}

function sameSign(a: number, b: number): boolean {
  return (a >= 0 && b >= 0) || (a < 0 && b < 0);
}

export interface RegimeDetail extends RegimeResult {
  signalsByRegime: Record<Regime, string[]>;
}

export function detectRegime(
  s: MarketSnapshot,
  crowd: number,
  liquidity: number,
): RegimeDetail {
  const gap = fairValueGapPct(s);
  const absGap = Math.abs(gap);
  const absVel = Math.abs(s.priceVelocityPct);
  const vm = s.avgVolume > 0 ? s.volume / s.avgVolume : 1;
  const hasEvent = s.macroEventActive || s.earningsEventActive;

  const conds: Record<Regime, Cond[]> = {
    "Clean Trend": [
      { label: "Confirmed directional move", strength: mapRange(absVel, 1, 3.5, 0, 1) },
      { label: "Sector / index confirms", strength: s.sectorConfirmation },
      {
        label: "Cross-market aligned",
        strength: sameSign(s.priceVelocityPct, s.sectorIndexChangePct)
          ? mapRange(Math.abs(s.sectorIndexChangePct), 0, 1.5, 0, 1)
          : 0,
      },
      { label: "Not crowded", strength: 1 - crowd / 100 },
      { label: "Fair value in range", strength: mapRange(absGap, 1.5, 0.2, 0, 1) },
      { label: "No event risk", strength: hasEvent ? 0 : 1 },
    ],
    "Crowded Hype": [
      { label: "Extreme crowd score", strength: crowd / 100 },
      { label: "Hype / social spike", strength: s.socialHypeSpike },
      { label: "Token outruns fair value", strength: mapRange(absGap, 1.5, 4, 0, 1) },
      { label: "Weak sector confirmation", strength: 1 - s.sectorConfirmation },
      { label: "Weak news evidence", strength: 1 - s.newsEvidenceQuality },
      { label: "Spread widened", strength: mapRange(s.spreadPct, 0.2, 0.6, 0, 1) },
    ],
    "Fair-Value Gap": [
      { label: "Statistically large gap", strength: mapRange(absGap, 1.2, 3.5, 0, 1) },
      { label: "No news explains the gap", strength: 1 - s.newsIntensity },
      { label: "Liquidity acceptable", strength: liquidity },
      { label: "Low hype", strength: 1 - s.socialHypeSpike },
      { label: "Calm price action", strength: mapRange(absVel, 1.5, 0, 0, 1) },
      { label: "No event risk", strength: hasEvent ? 0 : 1 },
    ],
    "Macro Shock": [
      { label: "Macro event active", strength: s.macroEventActive ? 1 : 0 },
      {
        label: "Sharp futures / yields move",
        strength: Math.max(
          mapRange(Math.abs(s.nasdaqFuturesChangePct), 0.8, 2.5, 0, 1),
          mapRange(Math.abs(s.yieldsChangeBps), 8, 25, 0, 1),
        ),
      },
      { label: "Broad risk repricing", strength: mapRange(Math.abs(s.sectorIndexChangePct), 0.8, 2.5, 0, 1) },
      { label: "Dollar (DXY) move", strength: mapRange(Math.abs(s.dxyChangePct), 0.4, 1.2, 0, 1) },
      { label: "Elevated volatility", strength: mapRange(s.volatilityPct, 3, 6, 0, 1) },
    ],
    "Earnings Event": [
      { label: "Earnings event active", strength: s.earningsEventActive ? 1 : 0 },
      { label: "Large news catalyst", strength: s.newsIntensity },
      { label: "Strong post-event move", strength: mapRange(absVel, 2, 6, 0, 1) },
      { label: "High volatility", strength: mapRange(s.volatilityPct, 3, 7, 0, 1) },
      { label: "Real fundamental evidence", strength: s.newsEvidenceQuality },
    ],
    Noise: [
      { label: "Low-conviction move", strength: mapRange(absVel, 1.0, 0, 0, 1) },
      { label: "Bad liquidity / wide spread", strength: mapRange(s.spreadPct, 0.3, 0.7, 0, 1) },
      { label: "Conflicting sentiment", strength: 1 - clamp01(Math.abs(s.newsSentiment) / 0.5) },
      { label: "No clear catalyst", strength: 1 - s.newsEvidenceQuality },
      { label: "Thin volume", strength: mapRange(vm, 0.9, 0.4, 0, 1) },
      { label: "Stale / unreliable data", strength: mapRange(s.dataFreshnessSec, 60, 240, 0, 1) },
    ],
  };

  const fit = {} as Record<Regime, number>;
  const signalsByRegime = {} as Record<Regime, string[]>;
  for (const r of REGIMES) {
    const f = fitOf(conds[r]);
    fit[r] = f.score;
    signalsByRegime[r] = f.signals;
  }

  const ranked = [...REGIMES].sort((a, b) => fit[b] - fit[a]);
  const top = ranked[0];
  const topFit = fit[top];
  const secondFit = fit[ranked[1]];
  const margin = topFit - secondFit;

  // Data quality dampens confidence regardless of fit.
  const dataQuality = clamp01(0.55 + 0.45 * liquidity);
  let confidence = clamp01(0.45 * topFit + 1.4 * margin + 0.12) * dataQuality;
  // The Noise regime is, by definition, low confidence.
  if (top === "Noise") confidence = Math.min(confidence, 0.62);
  confidence = round(confidence, 3);

  return {
    regime: top,
    confidence,
    signals: signalsByRegime[top],
    fit,
    signalsByRegime,
  };
}
