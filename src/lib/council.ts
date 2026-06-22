import type { AgentOutput, Direction, Stance, Strategy } from "@/lib/types";
import type { Signals } from "@/lib/context";
import { clamp01, mapRange, round } from "@/lib/util/num";

// Multi-Agent Strategy Council (PRD §13). These seven sensing/risk agents each
// emit a structured opinion + a normalized stance. The Strategy Router (the 8th
// agent, in router.ts) combines them. Stances are deterministic and explainable;
// the LLM layer later enriches the prose and writes the debate narrative — it
// never overrides these numbers, so the system stays reproducible and auditable.

function sentimentLabel(x: number): string {
  if (x >= 0.35) return "positive";
  if (x <= -0.35) return "negative";
  return "neutral";
}

function macroAgent({ snapshot: s }: Signals): AgentOutput {
  const riskOff =
    s.macroEventActive ||
    s.nasdaqFuturesChangePct < -0.6 ||
    s.yieldsChangeBps > 12;
  const riskOn =
    !riskOff && s.nasdaqFuturesChangePct > 0.25 && Math.abs(s.yieldsChangeBps) < 8;
  const macroRegime = riskOff ? "risk_off" : riskOn ? "risk_on" : "neutral";
  const riskLevel =
    s.macroEventActive || s.volatilityPct > 4
      ? "high"
      : s.volatilityPct > 2.5
        ? "medium"
        : "low";

  const stance: Stance = riskOff ? "avoid" : riskOn ? "follow" : "neutral";
  const confidence = round(
    clamp01(
      0.4 +
        Math.abs(s.nasdaqFuturesChangePct) * 0.15 +
        (s.macroEventActive ? 0.35 : 0),
    ),
    2,
  );

  const summary = s.macroEventActive
    ? `Macro event live (${s.macroEventLabel}); broad risk repricing — risk-off bias.`
    : riskOn
      ? `Nasdaq futures ${s.nasdaqFuturesChangePct > 0 ? "positive" : "soft"}, yields stable — risk-on backdrop.`
      : "Mixed macro backdrop, no decisive risk signal.";

  return {
    agent: "Macro",
    vote: { stance, confidence },
    summary,
    data: {
      macro_regime: macroRegime,
      risk_level: riskLevel,
      nasdaq_futures_pct: s.nasdaqFuturesChangePct,
      yields_change_bps: s.yieldsChangeBps,
      dxy_pct: s.dxyChangePct,
      macro_event: s.macroEventActive ? s.macroEventLabel ?? "active" : "none",
    },
  };
}

function newsAgent({ snapshot: s }: Signals): AgentOutput {
  const catalystStrength = round(s.newsIntensity * s.newsEvidenceQuality, 2);
  const hype = s.newsIntensity > 0.65 && s.newsEvidenceQuality < 0.45;
  const realPositive = catalystStrength > 0.45 && s.newsSentiment > 0.3;

  let stance: Stance = "neutral";
  if (hype) stance = "fade";
  else if (realPositive) stance = "follow";
  const confidence = round(clamp01(0.35 + s.newsIntensity * 0.5), 2);

  const summary = hype
    ? "High news intensity but weak evidence quality — looks like a hype catalyst."
    : realPositive
      ? "Strong, well-supported catalyst aligned with direction."
      : "No decisive catalyst; news is neutral or thin.";

  return {
    agent: "News",
    vote: { stance, confidence },
    summary,
    data: {
      sentiment: sentimentLabel(s.newsSentiment),
      sentiment_score: s.newsSentiment,
      catalyst_strength: catalystStrength,
      evidence_quality: s.newsEvidenceQuality,
      news_intensity: s.newsIntensity,
    },
  };
}

function fairValueAgent({ snapshot: s, gapPct }: Signals): AgentOutput {
  const status =
    gapPct > 0.8 ? "overvalued" : gapPct < -0.8 ? "undervalued" : "fair";
  const significant = Math.abs(gapPct) >= 1.5;
  const stance: Stance = significant ? "converge" : "neutral";
  const confidence = round(clamp01(0.3 + Math.abs(gapPct) / 4), 2);

  const summary = significant
    ? `Token ${status} by ${gapPct.toFixed(2)}% vs estimated fair value; unexplained tracking error.`
    : `Token within normal range of fair value (${gapPct.toFixed(2)}%).`;

  return {
    agent: "Fair-Value",
    vote: { stance, confidence },
    summary,
    data: {
      estimated_fair_value: s.estimatedFairValue,
      token_price: s.tokenPrice,
      fair_value_gap_pct: gapPct,
      gap_status: status,
      underlying_market_open: s.underlyingMarketOpen,
    },
  };
}

function crowdAgent({ crowd }: Signals): AgentOutput {
  const recommendation =
    crowd.score >= 60 ? "fade" : crowd.score < 30 ? "follow" : "avoid";
  const stance: Stance =
    crowd.score >= 60 ? "fade" : crowd.score < 30 ? "follow" : "neutral";
  const confidence = round(
    clamp01(0.4 + Math.abs(crowd.score - 50) / 100),
    2,
  );

  const summary =
    crowd.score >= 60
      ? `CrowdScore ${crowd.score} (${crowd.band}) — overreaction risk, prefer to fade.`
      : crowd.score < 30
        ? `CrowdScore ${crowd.score} (${crowd.band}) — move looks genuine, safe to follow.`
        : `CrowdScore ${crowd.score} (${crowd.band}) — ambiguous; no crowd edge.`;

  return {
    agent: "Crowd",
    vote: { stance, confidence },
    summary,
    data: {
      crowd_score: crowd.score,
      crowd_state: crowd.band,
      recommendation,
    },
  };
}

function technicalAgent({ snapshot: s, crowd }: Signals): AgentOutput {
  const vel = s.priceVelocityPct;
  const trendStrength = round(
    clamp01(mapRange(Math.abs(vel), 0, 4, 0, 1) * (0.5 + 0.5 * s.sectorConfirmation)),
    2,
  );
  const aligned =
    s.sectorConfirmation > 0.55 &&
    ((vel >= 0 && s.sectorIndexChangePct >= 0) ||
      (vel < 0 && s.sectorIndexChangePct < 0));
  let technicalState = "range";
  if (Math.abs(vel) >= 2 && aligned) technicalState = vel >= 0 ? "breakout" : "breakdown";
  else if (Math.abs(vel) >= 1) technicalState = vel >= 0 ? "uptrend" : "downtrend";

  const overextended = Math.abs(vel) >= 2.5 && crowd.score >= 65;
  let stance: Stance = "neutral";
  if (overextended) stance = "fade";
  else if (aligned && trendStrength > 0.4) stance = "follow";
  const confidence = round(clamp01(0.35 + trendStrength * 0.5), 2);

  const summary = overextended
    ? "Move is technically overextended into crowded conditions — reversal risk."
    : aligned && trendStrength > 0.4
      ? `${technicalState} confirmed by sector with trend strength ${trendStrength}.`
      : "No clean technical structure; price action unconfirmed.";

  return {
    agent: "Technical",
    vote: { stance, confidence },
    summary,
    data: {
      technical_state: technicalState,
      trend_strength: trendStrength,
      confirmation: aligned,
      price_velocity_pct: vel,
    },
  };
}

function liquidityAgent({ liquidity }: Signals): AgentOutput {
  const stance: Stance = liquidity.status === "untradable" ? "avoid" : "neutral";
  const confidence = round(clamp01(0.4 + (1 - liquidity.score) * 0.4), 2);
  const summary =
    liquidity.status === "untradable"
      ? `Liquidity ${liquidity.status} (score ${liquidity.score}); execution unsafe.`
      : `Liquidity ${liquidity.status} (score ${liquidity.score}); slippage ~${liquidity.slippageEstimatePct}%.`;
  return {
    agent: "Liquidity",
    vote: { stance, confidence },
    summary,
    data: {
      liquidity_status: liquidity.status,
      liquidity_score: liquidity.score,
      slippage_estimate_pct: liquidity.slippageEstimatePct,
    },
  };
}

function riskAgent({ snapshot: s, risk }: Signals): AgentOutput {
  const eventRisk = s.macroEventActive || s.earningsEventActive;
  const elevated = risk.score >= 0.55 || eventRisk;
  const stance: Stance = elevated ? "avoid" : "neutral";
  const confidence = round(clamp01(0.4 + risk.score * 0.4), 2);
  const summary = eventRisk
    ? "Elevated event risk — recommend reduced size or stand aside."
    : elevated
      ? `Risk score ${risk.score} elevated — tighten sizing.`
      : `Risk score ${risk.score} normal.`;
  return {
    agent: "Risk",
    vote: { stance, confidence },
    summary,
    data: {
      risk_score: risk.score,
      event_risk: eventRisk,
      volatility_pct: s.volatilityPct,
    },
  };
}

export function runCouncil(sig: Signals): AgentOutput[] {
  return [
    macroAgent(sig),
    newsAgent(sig),
    fairValueAgent(sig),
    crowdAgent(sig),
    technicalAgent(sig),
    liquidityAgent(sig),
    riskAgent(sig),
  ];
}

// Map a selected strategy to the stance a council member would have to share to
// be counted "in agreement" (PRD §32 "Agent agreement: 6/8").
export function primaryStance(strategy: Strategy): Stance {
  switch (strategy) {
    case "Momentum Follow":
      return "follow";
    case "CounterFlow Fade":
      return "fade";
    case "Fair-Value Convergence":
      return "converge";
    case "No-Trade / Risk-Off":
      return "avoid";
  }
}

/** Council agreement over all 8 agents (7 sensing/risk + the Strategy Router,
 *  which backs its own pick by construction).
 *
 *  We count *opposition*, not stance-identity: a neutral agent is abstaining, not
 *  disagreeing. An agent opposes a trade when it says "avoid", or when its
 *  directional bias contradicts the trade direction (a bullish "follow" against a
 *  short, or a bearish "fade" against a long). For a No-Trade call, agents that
 *  actively wanted a trade (with conviction) are the opposition. */
export function agentAgreement(
  council: AgentOutput[],
  strategy: Strategy,
  direction: Direction,
): { agree: number; total: number } {
  const total = council.length + 1;
  let opposers = 0;

  if (strategy === "No-Trade / Risk-Off") {
    opposers = council.filter(
      (a) =>
        (a.vote.stance === "follow" ||
          a.vote.stance === "fade" ||
          a.vote.stance === "converge") &&
        a.vote.confidence > 0.55,
    ).length;
  } else {
    opposers = council.filter((a) => {
      if (a.vote.stance === "avoid") return true;
      if (direction === "short" && a.vote.stance === "follow") return true;
      if (direction === "long" && a.vote.stance === "fade") return true;
      return false;
    }).length;
  }

  return { agree: total - opposers, total };
}
