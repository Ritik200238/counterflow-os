import type {
  AgentOutput,
  Direction,
  RejectedStrategy,
  Regime,
  Strategy,
  StrategySelection,
} from "@/lib/types";
import { STRATEGIES } from "@/lib/types";
import type { Signals } from "@/lib/context";
import { agentAgreement, primaryStance } from "@/lib/council";
import { clamp01, mapRange, round } from "@/lib/util/num";

// Strategy Router (PRD §13.8). Evaluates every strategy's entry conditions
// (PRD §11), scores the eligible ones, and selects the best — or stands aside.
// It always records why each rejected strategy lost.
//
// Event handling (PRD §14.1): during a high-impact macro/earnings event, only the
// dedicated event strategy (Macro Rebalance / Earnings Drift) may trade; the
// directional strategies stand down.

const IDEAL_REGIME: Record<Strategy, Regime> = {
  "Momentum Follow": "Clean Trend",
  "CounterFlow Fade": "Crowded Hype",
  "Fair-Value Convergence": "Fair-Value Gap",
  "Volatility Breakout": "Clean Trend",
  "Earnings Drift": "Earnings Event",
  "Macro Rebalance": "Macro Shock",
  "No-Trade / Risk-Off": "Noise",
};

interface StrategyEval {
  strategy: Strategy;
  eligible: boolean;
  score: number;
  direction: Direction;
  reasonIfNot: string;
}

function volMult(sig: Signals): number {
  const s = sig.snapshot;
  return s.avgVolume > 0 ? s.volume / s.avgVolume : 1;
}

function evalFade(sig: Signals): StrategyEval {
  const { snapshot: s, crowd, liquidity, gapPct } = sig;
  const tradable = liquidity.status !== "untradable";
  const eligible = crowd.score >= 65 && tradable;
  const score = round(
    clamp01(
      0.32 * (crowd.score / 100) +
        0.22 * (1 - s.sectorConfirmation) +
        0.26 * mapRange(Math.abs(gapPct), 1.5, 4, 0, 1) +
        0.2 * clamp01(s.newsIntensity * (1 - s.newsEvidenceQuality) * 1.6),
    ),
    3,
  );
  const direction: Direction = s.priceVelocityPct >= 0 ? "short" : "long";
  const reasonIfNot = !tradable
    ? "Liquidity untradable"
    : crowd.score < 65
      ? `Crowding not extreme (CrowdScore ${crowd.score} < 65)`
      : "Lower setup score";
  return { strategy: "CounterFlow Fade", eligible, score, direction, reasonIfNot };
}

function evalMomentum(sig: Signals): StrategyEval {
  const { snapshot: s, crowd, liquidity, gapPct } = sig;
  const tradable = liquidity.status !== "untradable";
  const trend = Math.abs(s.priceVelocityPct) > 1.2;
  const confirmed = s.sectorConfirmation > 0.6;
  const notOverheated = crowd.score < 60;
  // Explosive moves belong to Volatility Breakout, not steady Momentum.
  const notBreakout = !(Math.abs(s.priceVelocityPct) > 3.2 && volMult(sig) > 1.8 && s.volatilityPct > 2.6);
  const eligible = trend && confirmed && notOverheated && notBreakout && tradable;
  const score = round(
    clamp01(
      0.26 * s.sectorConfirmation +
        0.26 * mapRange(Math.abs(s.priceVelocityPct), 1, 4, 0, 1) +
        0.2 * clamp01(s.newsIntensity * s.newsEvidenceQuality * 1.6) +
        0.16 * (1 - crowd.score / 100) +
        0.12 * mapRange(Math.abs(gapPct), 3, 0.5, 0, 1),
    ),
    3,
  );
  const direction: Direction = s.priceVelocityPct >= 0 ? "long" : "short";
  const reasonIfNot = !tradable
    ? "Liquidity untradable"
    : !confirmed
      ? "Sector / index confirmation weak"
      : !trend
        ? "No confirmed trend (low velocity)"
        : !notOverheated
          ? `Crowd overheated (CrowdScore ${crowd.score})`
          : !notBreakout
            ? "Move is breakout-grade — Volatility Breakout territory"
            : "Lower setup score";
  return { strategy: "Momentum Follow", eligible, score, direction, reasonIfNot };
}

function evalConvergence(sig: Signals): StrategyEval {
  const { snapshot: s, liquidity, gapPct } = sig;
  const tradable = liquidity.status !== "untradable";
  const significant = Math.abs(gapPct) >= 1.5;
  const unexplained = s.newsIntensity < 0.5;
  const spreadOk = s.spreadPct < 0.4;
  const eligible = significant && unexplained && spreadOk && tradable;
  const score = round(
    clamp01(
      0.34 * mapRange(Math.abs(gapPct), 1.2, 3.5, 0, 1) +
        0.24 * (1 - s.newsIntensity) +
        0.24 * liquidity.score +
        0.18 * (1 - s.socialHypeSpike),
    ),
    3,
  );
  const direction: Direction = gapPct > 0 ? "short" : "long";
  const reasonIfNot = !tradable
    ? "Liquidity untradable"
    : !significant
      ? "Fair-value gap not statistically significant"
      : !unexplained
        ? "News may explain the gap"
        : !spreadOk
          ? "Spread too wide for convergence"
          : "Lower setup score";
  return { strategy: "Fair-Value Convergence", eligible, score, direction, reasonIfNot };
}

function evalVolBreakout(sig: Signals): StrategyEval {
  const { snapshot: s, crowd, liquidity } = sig;
  const tradable = liquidity.status !== "untradable";
  const vm = volMult(sig);
  const fastMove = Math.abs(s.priceVelocityPct) > 3.2;
  const volumeSurge = vm > 1.8;
  const expanding = s.volatilityPct > 2.6;
  const confirmed = s.sectorConfirmation > 0.5;
  const notCrowded = crowd.score < 70;
  const eligible = fastMove && volumeSurge && expanding && confirmed && notCrowded && tradable;
  const score = round(
    clamp01(
      0.3 * mapRange(Math.abs(s.priceVelocityPct), 3, 6, 0, 1) +
        0.25 * mapRange(vm, 1.5, 3.5, 0, 1) +
        0.25 * mapRange(s.volatilityPct, 2.5, 6, 0, 1) +
        0.2 * s.sectorConfirmation,
    ),
    3,
  );
  const direction: Direction = s.priceVelocityPct >= 0 ? "long" : "short";
  const reasonIfNot = !tradable
    ? "Liquidity untradable"
    : !fastMove
      ? "Move not explosive enough for a breakout"
      : !volumeSurge
        ? "Volume not surging"
        : !expanding
          ? "Volatility not expanding"
          : !confirmed
            ? "Breakout unconfirmed by sector"
            : !notCrowded
              ? "Breakout already crowded"
              : "Lower setup score";
  return { strategy: "Volatility Breakout", eligible, score, direction, reasonIfNot };
}

function evalEarnings(sig: Signals): StrategyEval {
  const { snapshot: s, liquidity } = sig;
  const tradable = liquidity.status !== "untradable";
  const realCatalyst = s.newsEvidenceQuality > 0.5;
  const eligible = s.earningsEventActive && realCatalyst && tradable;
  const score = round(
    clamp01(
      0.3 * s.newsIntensity * s.newsEvidenceQuality +
        0.3 * mapRange(Math.abs(s.priceVelocityPct), 2, 6, 0, 1) +
        0.2 * s.newsEvidenceQuality +
        0.2 * liquidity.score,
    ),
    3,
  );
  const direction: Direction = s.priceVelocityPct >= 0 ? "long" : "short";
  const reasonIfNot = !s.earningsEventActive
    ? "No earnings event active"
    : !tradable
      ? "Liquidity untradable"
      : !realCatalyst
        ? "Earnings signal lacks evidence quality"
        : "Lower setup score";
  return { strategy: "Earnings Drift", eligible, score, direction, reasonIfNot };
}

function evalMacro(sig: Signals): StrategyEval {
  const { snapshot: s, liquidity } = sig;
  const tradable = liquidity.status !== "untradable";
  const eligible = s.macroEventActive && tradable;
  const score = round(
    clamp01(
      0.3 +
        0.3 * mapRange(Math.abs(s.sectorIndexChangePct), 0.8, 2.5, 0, 1) +
        0.2 * mapRange(Math.abs(s.nasdaqFuturesChangePct), 0.8, 2.5, 0, 1) +
        0.2 * mapRange(s.volatilityPct, 3, 6, 0, 1),
    ),
    3,
  );
  // Follow the broad risk move: risk-off (index/futures down) -> short risk.
  const riskOff = s.sectorIndexChangePct < 0 || s.nasdaqFuturesChangePct < 0;
  const direction: Direction = riskOff ? "short" : "long";
  const reasonIfNot = !s.macroEventActive
    ? "No macro event active"
    : !tradable
      ? "Liquidity untradable"
      : "Lower setup score";
  return { strategy: "Macro Rebalance", eligible, score, direction, reasonIfNot };
}

export interface RouterResult extends StrategySelection {
  evaluations: { strategy: Strategy; eligible: boolean; score: number }[];
  agreement: { agree: number; total: number };
  routerAgent: AgentOutput;
}

const EXECUTION_THRESHOLD = 0.45;

export function routeStrategy(sig: Signals, council: AgentOutput[]): RouterResult {
  const { snapshot: s, liquidity, regime, risk } = sig;
  const eventRisk = s.macroEventActive || s.earningsEventActive;

  const fade = evalFade(sig);
  const momentum = evalMomentum(sig);
  const convergence = evalConvergence(sig);
  const breakout = evalVolBreakout(sig);
  const earnings = evalEarnings(sig);
  const macro = evalMacro(sig);

  // Strategies that compete when there is NO high-impact event.
  const directional = [momentum, fade, convergence, breakout];

  let selected: Strategy = "No-Trade / Risk-Off";
  let direction: Direction = "flat";
  let reason = "";

  const standAside = (r: string) => {
    selected = "No-Trade / Risk-Off";
    direction = "flat";
    reason = r;
  };

  if (s.earningsEventActive) {
    if (earnings.eligible && earnings.score >= EXECUTION_THRESHOLD) {
      selected = "Earnings Drift";
      direction = earnings.direction;
      reason = `Earnings event (${s.earningsEventLabel}); trading the drift with Earnings Drift (score ${earnings.score}).`;
    } else {
      standAside(`Earnings event (${s.earningsEventLabel}) without a clean drift setup — standing aside.`);
    }
  } else if (s.macroEventActive) {
    if (macro.eligible && macro.score >= EXECUTION_THRESHOLD) {
      selected = "Macro Rebalance";
      direction = macro.direction;
      reason = `Macro shock (${s.macroEventLabel}); Macro Rebalance positions ${macro.direction} (score ${macro.score}).`;
    } else {
      standAside(`Macro shock (${s.macroEventLabel}); no tradable rebalance — risk-off, standing aside.`);
    }
  } else if (liquidity.status === "untradable") {
    standAside(`Liquidity ${liquidity.status} (score ${liquidity.score}); cannot execute safely.`);
  } else {
    const eligible = directional.filter((e) => e.eligible).sort((a, b) => b.score - a.score);
    const best = eligible[0];
    if (!best) standAside("No strategy meets its entry conditions in the current regime.");
    else if (best.score < EXECUTION_THRESHOLD)
      standAside(`Best setup (${best.strategy}, ${best.score}) is below the execution threshold ${EXECUTION_THRESHOLD}.`);
    else {
      selected = best.strategy;
      direction = best.direction;
      reason = `${best.strategy} fits the ${regime.regime} regime with the strongest setup score (${best.score}).`;
    }
  }

  const noTradeEval: StrategyEval = {
    strategy: "No-Trade / Risk-Off",
    eligible: true,
    score: round(clamp01(0.4 * (1 - regime.confidence) + 0.3 * risk.score + 0.3 * (eventRisk ? 1 : 0)), 3),
    direction: "flat",
    reasonIfNot: "Edge present; standing aside not warranted",
  };

  const byStrategy: Record<Strategy, StrategyEval> = {
    "Momentum Follow": momentum,
    "CounterFlow Fade": fade,
    "Fair-Value Convergence": convergence,
    "Volatility Breakout": breakout,
    "Earnings Drift": earnings,
    "Macro Rebalance": macro,
    "No-Trade / Risk-Off": noTradeEval,
  };

  const selectedEval = byStrategy[selected!];

  const rejectedStrategies: RejectedStrategy[] = STRATEGIES.filter((st) => st !== selected!).map((st) => {
    const e = byStrategy[st];
    if (st === "No-Trade / Risk-Off") {
      return { strategy: st, reason: "Confidence above execution threshold; an edge is present." };
    }
    const r = !e.eligible
      ? e.reasonIfNot
      : `Lower setup score than ${selected} (${e.score} vs ${selectedEval.score}).`;
    return { strategy: st, reason: r };
  });

  const agreement = agentAgreement(council, selected!, direction!);
  const agreementFrac = agreement.agree / agreement.total;
  const regimeFit = regime.fit[IDEAL_REGIME[selected!]];

  let confidence: number;
  if (selected! === "No-Trade / Risk-Off") {
    confidence = round(clamp01(0.5 + 0.3 * selectedEval.score + 0.2 * agreementFrac), 3);
  } else {
    confidence = round(
      clamp01(0.34 * selectedEval.score + 0.28 * agreementFrac + 0.22 * regimeFit + 0.16 * liquidity.score),
      3,
    );
  }

  const routerAgent: AgentOutput = {
    agent: "Strategy Router",
    vote: { stance: primaryStance(selected!), confidence },
    summary: reason!,
    data: {
      selected_strategy: selected!,
      direction: direction!,
      confidence,
      regime: regime.regime,
      agent_agreement: `${agreement.agree}/${agreement.total}`,
    },
  };

  return {
    selectedStrategy: selected!,
    direction: direction!,
    confidence,
    rejectedStrategies,
    reason: reason!,
    evaluations: [...directional, earnings, macro].map((e) => ({
      strategy: e.strategy,
      eligible: e.eligible,
      score: e.score,
    })),
    agreement,
    routerAgent,
  };
}
