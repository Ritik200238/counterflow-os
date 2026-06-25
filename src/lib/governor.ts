import type { RiskDecision, RiskState, Strategy } from "@/lib/types";
import type { Signals } from "@/lib/context";
import type { RouterResult } from "@/lib/router";
import { clamp, mapRange, round } from "@/lib/util/num";

// Risk Governor (PRD §14). Hard rules + risk states. Sits AFTER the router and can
// reduce size or block a selected trade outright. It is the last word before the
// paper executor.

export const RISK_LIMITS = {
  maxPositionPctPerAsset: 15,
  maxPortfolioExposurePct: 60,
  maxDailyDrawdownPct: 3, // kill switch
  maxLossPerTradePct: 1.5, // stop-loss cap (price level)
  maxSpreadPct: 0.55, // no trade above this spread
  maxDataAgeSec: 180, // no trade if freshness fails
  minAgreementFrac: 0.5, // no trade if council disagrees beyond this
} as const;

// Per-strategy stop / take-profit defaults (PRD §13.7 / §14 examples).
function stopTake(strategy: Strategy, gapPct: number): { stop: number; take: number } {
  switch (strategy) {
    case "CounterFlow Fade":
      return { stop: 1.2, take: 2.4 };
    case "Momentum Follow":
      return { stop: 1.5, take: 3.0 };
    case "Fair-Value Convergence": {
      const take = clamp(Math.abs(gapPct) * 0.7, 1.5, 3.5);
      return { stop: 1.2, take: round(take, 2) };
    }
    case "Volatility Breakout":
      return { stop: 1.5, take: 3.6 };
    case "Earnings Drift":
      return { stop: 1.5, take: 4.0 };
    case "Macro Rebalance":
      return { stop: 1.5, take: 2.5 };
    case "No-Trade / Risk-Off":
      return { stop: 0, take: 0 };
  }
}

// Strategies explicitly designed to trade THROUGH a high-impact event
// (PRD §14.1: "no trade during events unless the macro strategy is selected").
function isEventStrategy(s: Strategy): boolean {
  return s === "Macro Rebalance" || s === "Earnings Drift";
}

export interface RiskGovernorInput {
  portfolioExposurePct?: number; // sum of currently-open position sizes
  dailyDrawdownPct?: number; // negative number, e.g. -2.1
}

export function riskGovernor(
  sig: Signals,
  router: RouterResult,
  opts: RiskGovernorInput = {},
): RiskDecision {
  const { snapshot: s, crowd, risk } = sig;
  const strategy = router.selectedStrategy;
  const exposure = opts.portfolioExposurePct ?? 0;
  const drawdown = opts.dailyDrawdownPct ?? 0;
  const eventRisk = s.macroEventActive || s.earningsEventActive;
  const agreementFrac = router.agreement.agree / router.agreement.total;

  const reasons: string[] = [];
  const blocks: string[] = [];

  // --- Risk state ----------------------------------------------------------
  let riskState: RiskState = "Normal";
  if (drawdown <= -RISK_LIMITS.maxDailyDrawdownPct) {
    riskState = "Kill Switch";
    blocks.push(
      `Daily drawdown ${round(drawdown, 2)}% hit the ${RISK_LIMITS.maxDailyDrawdownPct}% loss limit — kill switch engaged.`,
    );
  } else if (
    risk.score >= 0.75 ||
    (eventRisk && !isEventStrategy(strategy) && strategy !== "No-Trade / Risk-Off")
  ) {
    riskState = "Risk-Off";
  } else if (risk.score >= 0.5 || crowd.score >= 80) {
    riskState = "Caution";
  }

  // --- The router chose to stand aside ------------------------------------
  if (strategy === "No-Trade / Risk-Off") {
    return {
      approved: false,
      riskState: eventRisk ? "Risk-Off" : riskState,
      positionSizePct: 0,
      stopLossPct: 0,
      takeProfitPct: 0,
      maxLossPct: 0,
      reasons: ["No position — router selected No-Trade / Risk-Off."],
      blocks,
    };
  }

  // --- Hard-rule gates (any block => no trade) -----------------------------
  if (s.spreadPct > RISK_LIMITS.maxSpreadPct) {
    blocks.push(`Spread ${s.spreadPct}% exceeds max ${RISK_LIMITS.maxSpreadPct}%.`);
  }
  if (s.dataFreshnessSec > RISK_LIMITS.maxDataAgeSec) {
    blocks.push(`Data age ${s.dataFreshnessSec}s exceeds max ${RISK_LIMITS.maxDataAgeSec}s.`);
  }
  if (agreementFrac < RISK_LIMITS.minAgreementFrac) {
    blocks.push(
      `Council agreement ${router.agreement.agree}/${router.agreement.total} below the ${RISK_LIMITS.minAgreementFrac * 100}% minimum.`,
    );
  }
  if (eventRisk && !isEventStrategy(strategy)) {
    blocks.push("High-impact event active — new directional risk blocked by policy.");
  }
  if (riskState === "Kill Switch" || riskState === "Risk-Off") {
    if (riskState === "Risk-Off") blocks.push("Risk state is Risk-Off — new trades blocked.");
  }

  // --- Position sizing -----------------------------------------------------
  // Base size scales with strategy confidence, dialed back by environment risk.
  let size = mapRange(router.confidence, 0.45, 0.85, 3, 12) * (1 - 0.4 * risk.score);
  if (riskState === "Caution") {
    size *= 0.5;
    reasons.push("Caution state — position size reduced by 50%.");
  }
  size = clamp(size, 0, RISK_LIMITS.maxPositionPctPerAsset);

  // Portfolio exposure cap.
  const room = RISK_LIMITS.maxPortfolioExposurePct - exposure;
  if (room <= 0) {
    blocks.push(
      `Portfolio exposure ${round(exposure, 1)}% at the ${RISK_LIMITS.maxPortfolioExposurePct}% cap — no room for new risk.`,
    );
  } else if (size > room) {
    size = room;
    reasons.push(
      `Position trimmed to fit the ${RISK_LIMITS.maxPortfolioExposurePct}% portfolio exposure cap.`,
    );
  }

  const { stop, take } = stopTake(strategy, sig.gapPct);
  const stopLossPct = Math.min(stop, RISK_LIMITS.maxLossPerTradePct);

  const approved = blocks.length === 0 && size > 0;
  if (approved) {
    reasons.unshift(
      `Approved: size ${round(size, 1)}% of portfolio, stop ${stopLossPct}%, take-profit ${take}% (${riskState}).`,
    );
  } else if (blocks.length > 0) {
    reasons.unshift("Trade blocked by hard risk rules.");
  }

  return {
    approved,
    riskState,
    positionSizePct: approved ? round(size, 1) : 0,
    stopLossPct: approved ? stopLossPct : 0,
    takeProfitPct: approved ? take : 0,
    maxLossPct: approved ? stopLossPct : 0,
    reasons,
    blocks,
  };
}

// Used by the dashboard / autopilot to summarize whether the market-wide state
// should throttle trading regardless of any single asset.
export function describeRiskState(state: RiskState): string {
  switch (state) {
    case "Normal":
      return "Allow strategy-selected trades.";
    case "Caution":
      return "Reduce size by 50%.";
    case "Risk-Off":
      return "New trades blocked.";
    case "Kill Switch":
      return "Close paper positions and stop trading.";
  }
}
