import type {
  AgentOutput,
  Direction,
  RejectedStrategy,
  Regime,
  Strategy,
  StrategySelection,
} from "@/lib/types";
import type { Signals } from "@/lib/context";
import { agentAgreement } from "@/lib/council";
import { clamp01, mapRange, round } from "@/lib/util/num";

// Strategy Router (PRD §13.8). Evaluates every strategy's entry conditions
// (PRD §11), scores the eligible ones, and selects the best — or stands aside.
// It always records why each rejected strategy lost, because the rejection trail
// is as important to the product as the pick.

const IDEAL_REGIME: Record<Strategy, Regime> = {
  "Momentum Follow": "Clean Trend",
  "CounterFlow Fade": "Crowded Hype",
  "Fair-Value Convergence": "Fair-Value Gap",
  "No-Trade / Risk-Off": "Noise",
};

interface StrategyEval {
  strategy: Strategy;
  eligible: boolean;
  score: number; // 0..1 setup quality
  direction: Direction;
  reasonIfNot: string; // why it would be rejected
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
  const eligible = trend && confirmed && notOverheated && tradable;
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

export interface RouterResult extends StrategySelection {
  evaluations: { strategy: Strategy; eligible: boolean; score: number }[];
  agreement: { agree: number; total: number };
  routerAgent: AgentOutput;
}

const EXECUTION_THRESHOLD = 0.45;

export function routeStrategy(sig: Signals, council: AgentOutput[]): RouterResult {
  const { snapshot: s, liquidity, regime, risk } = sig;
  const eventRisk = s.macroEventActive || s.earningsEventActive;
  const eventLabel = s.macroEventActive
    ? s.macroEventLabel
    : s.earningsEventActive
      ? s.earningsEventLabel
      : undefined;

  const fade = evalFade(sig);
  const momentum = evalMomentum(sig);
  const convergence = evalConvergence(sig);
  const actives = [momentum, fade, convergence];

  let selected: Strategy;
  let direction: Direction;
  let reason: string;

  if (eventRisk) {
    selected = "No-Trade / Risk-Off";
    direction = "flat";
    reason = `High-impact event risk (${eventLabel}); risk policy stands aside until it clears.`;
  } else if (liquidity.status === "untradable") {
    selected = "No-Trade / Risk-Off";
    direction = "flat";
    reason = `Liquidity ${liquidity.status} (score ${liquidity.score}); cannot execute safely.`;
  } else {
    const eligible = actives.filter((e) => e.eligible);
    const best = eligible.sort((a, b) => b.score - a.score)[0];
    if (!best) {
      selected = "No-Trade / Risk-Off";
      direction = "flat";
      reason = "No strategy meets its entry conditions in the current regime.";
    } else if (best.score < EXECUTION_THRESHOLD) {
      selected = "No-Trade / Risk-Off";
      direction = "flat";
      reason = `Best setup (${best.strategy}, score ${best.score}) is below the execution threshold ${EXECUTION_THRESHOLD}.`;
    } else {
      selected = best.strategy;
      direction = best.direction;
      reason = `${best.strategy} fits the ${regime.regime} regime with the strongest setup score (${best.score}).`;
    }
  }

  const byStrategy: Record<Strategy, StrategyEval> = {
    "Momentum Follow": momentum,
    "CounterFlow Fade": fade,
    "Fair-Value Convergence": convergence,
    "No-Trade / Risk-Off": {
      strategy: "No-Trade / Risk-Off",
      eligible: true,
      score: round(
        clamp01(
          0.4 * (1 - regime.confidence) +
            0.3 * risk.score +
            0.3 * (eventRisk ? 1 : 0),
        ),
        3,
      ),
      direction: "flat",
      reasonIfNot: "Edge present; standing aside not warranted",
    },
  };

  const selectedEval = byStrategy[selected];

  // Build rejected list (everything not selected) with a concrete reason.
  const rejectedStrategies: RejectedStrategy[] = (
    ["Momentum Follow", "CounterFlow Fade", "Fair-Value Convergence", "No-Trade / Risk-Off"] as Strategy[]
  )
    .filter((st) => st !== selected)
    .map((st) => {
      const e = byStrategy[st];
      if (st === "No-Trade / Risk-Off") {
        return { strategy: st, reason: "Confidence above execution threshold; an edge is present." };
      }
      const r = !e.eligible
        ? e.reasonIfNot
        : `Lower setup score than ${selected} (${e.score} vs ${selectedEval.score}).`;
      return { strategy: st, reason: r };
    });

  const agreement = agentAgreement(council, selected, direction);
  const agreementFrac = agreement.agree / agreement.total;
  const regimeFit = regime.fit[IDEAL_REGIME[selected]];

  let confidence: number;
  if (selected === "No-Trade / Risk-Off") {
    confidence = round(
      clamp01(0.5 + 0.3 * selectedEval.score + 0.2 * agreementFrac),
      3,
    );
  } else {
    confidence = round(
      clamp01(
        0.34 * selectedEval.score +
          0.28 * agreementFrac +
          0.22 * regimeFit +
          0.16 * liquidity.score,
      ),
      3,
    );
  }

  const routerAgent: AgentOutput = {
    agent: "Strategy Router",
    vote: {
      stance:
        selected === "Momentum Follow"
          ? "follow"
          : selected === "CounterFlow Fade"
            ? "fade"
            : selected === "Fair-Value Convergence"
              ? "converge"
              : "avoid",
      confidence,
    },
    summary: reason,
    data: {
      selected_strategy: selected,
      direction,
      confidence,
      regime: regime.regime,
      agent_agreement: `${agreement.agree}/${agreement.total}`,
    },
  };

  return {
    selectedStrategy: selected,
    direction,
    confidence,
    rejectedStrategies,
    reason,
    evaluations: actives.map((e) => ({
      strategy: e.strategy,
      eligible: e.eligible,
      score: e.score,
    })),
    agreement,
    routerAgent,
  };
}
