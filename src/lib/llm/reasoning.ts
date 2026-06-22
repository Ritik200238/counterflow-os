import type {
  AgentOutput,
  Direction,
  FinalAction,
  Regime,
  RejectedStrategy,
  RiskDecision,
  Strategy,
} from "@/lib/types";
import {
  extractJson,
  qwenChat,
  qwenConfigured,
  qwenModel,
} from "@/lib/llm/qwen";

// Reasoning layer. The LLM (Qwen) writes the council debate narrative and the
// headline rationale on top of the deterministic decision. It never changes the
// numbers — it explains them. If the API is unavailable, a deterministic
// fallback produces a genuinely useful narrative from the council outputs, so the
// product is fully functional offline.

export interface ReasoningInput {
  asset: string;
  regime: Regime;
  regimeConfidence: number;
  crowdScore: number;
  fairValueGapPct: number;
  selectedStrategy: Strategy;
  direction: Direction;
  rejectedStrategies: RejectedStrategy[];
  council: AgentOutput[];
  agreement: { agree: number; total: number };
  risk: RiskDecision;
  finalAction: FinalAction;
}

export interface ReasoningResult {
  rationale: string;
  debate: string;
  source: "qwen" | "deterministic";
  model?: string;
}

function deterministicNarrative(input: ReasoningInput): ReasoningResult {
  const lines = input.council.map((a) => `• ${a.agent}: ${a.summary}`);
  const actionText =
    input.finalAction === "no_trade"
      ? "No paper trade taken"
      : `${input.direction === "short" ? "Short" : "Long"} paper trade`;
  const riskLine = input.risk.approved
    ? `Risk Governor approved at ${input.risk.positionSizePct}% size (stop ${input.risk.stopLossPct}%, take-profit ${input.risk.takeProfitPct}%, ${input.risk.riskState}).`
    : `Risk Governor: ${input.risk.blocks[0] ?? "no position taken"} (${input.risk.riskState}).`;

  const debate = [
    `Council deliberation for ${input.asset} — detected regime: ${input.regime} (confidence ${Math.round(
      input.regimeConfidence * 100,
    )}%). Agreement ${input.agreement.agree}/${input.agreement.total}.`,
    ...lines,
    `→ ${riskLine}`,
  ].join("\n");

  const rationale =
    input.finalAction === "no_trade"
      ? `${input.asset}: ${input.regime} regime — ${actionText}. ${input.risk.blocks[0] ?? "no qualifying edge"}.`
      : `${input.asset}: ${input.regime} regime with CrowdScore ${input.crowdScore} and a ${input.fairValueGapPct.toFixed(
          2,
        )}% fair-value gap. ${input.selectedStrategy} selected — ${actionText}.`;

  return { rationale, debate, source: "deterministic" };
}

function buildPrompt(input: ReasoningInput): { system: string; user: string } {
  const system = [
    "You are the reasoning narrator for CounterFlow OS, an autonomous strategy-routing system for 24/7 tokenized US stocks.",
    "You are given a decision that has ALREADY been made deterministically by the engine. Do NOT change any numbers, the regime, the selected strategy, the direction, or the risk decision.",
    "Your job is only to explain it clearly and to write a short multi-agent council debate.",
    'Respond ONLY with strict JSON: {"rationale": string, "debate": string}.',
    "rationale: <= 45 words, the headline reason for the decision.",
    "debate: <= 130 words, written as a brief deliberation that references the council agents by name (Macro, News, Fair-Value, Crowd, Technical, Liquidity, Risk) and ends with the Strategy Router's call. Plain text, newlines allowed.",
    "Be precise, neutral, and auditable. No hype, no profit promises.",
  ].join(" ");

  const user = JSON.stringify({
    asset: input.asset,
    regime: input.regime,
    regime_confidence: input.regimeConfidence,
    crowd_score: input.crowdScore,
    fair_value_gap_pct: input.fairValueGapPct,
    selected_strategy: input.selectedStrategy,
    direction: input.direction,
    final_action: input.finalAction,
    agreement: `${input.agreement.agree}/${input.agreement.total}`,
    rejected_strategies: input.rejectedStrategies,
    risk: {
      approved: input.risk.approved,
      state: input.risk.riskState,
      position_size_pct: input.risk.positionSizePct,
      stop_loss_pct: input.risk.stopLossPct,
      take_profit_pct: input.risk.takeProfitPct,
      blocks: input.risk.blocks,
    },
    council: input.council.map((a) => ({
      agent: a.agent,
      stance: a.vote.stance,
      confidence: a.vote.confidence,
      summary: a.summary,
    })),
  });

  return { system, user };
}

const cache = new Map<string, ReasoningResult>();

function cacheKey(input: ReasoningInput): string {
  return [
    input.asset,
    input.regime,
    input.selectedStrategy,
    input.direction,
    input.finalAction,
    input.crowdScore,
    input.fairValueGapPct.toFixed(2),
    input.agreement.agree,
  ].join("|");
}

export async function generateReasoning(
  input: ReasoningInput,
  useLLM = true,
): Promise<ReasoningResult> {
  const fallback = deterministicNarrative(input);
  if (!useLLM || !qwenConfigured()) return fallback;

  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { system, user } = buildPrompt(input);
    const raw = await qwenChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { json: true, temperature: 0.4, maxTokens: 600 },
    );
    const parsed = extractJson<{ rationale?: string; debate?: string }>(raw);
    if (parsed?.rationale && parsed?.debate) {
      const result: ReasoningResult = {
        rationale: parsed.rationale.trim(),
        debate: parsed.debate.trim(),
        source: "qwen",
        model: qwenModel(),
      };
      cache.set(key, result);
      return result;
    }
    return fallback;
  } catch {
    // Any API failure -> deterministic narrative. The decision itself is unaffected.
    return fallback;
  }
}
