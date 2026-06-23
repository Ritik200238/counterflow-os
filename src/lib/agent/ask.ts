import type { AssetSymbol, CrowdingIndex, DecisionPacket } from "@/lib/types";
import { extractJson, qwenChat, qwenConfigured, qwenModel } from "@/lib/llm/qwen";
import { pct } from "@/lib/util/num";

// "Ask CounterFlow" — the natural-language agent interface (inspired by
// Vibe-Trading's core "ask a trading question" UX). A question comes in; the
// answer is ALWAYS grounded in the engine's real structured output (regimes,
// strategies, scores, rationales) — Qwen only phrases it, and a deterministic
// fallback produces a genuinely useful grounded answer with no LLM. Numbers are
// never invented.

const ALIASES: Record<AssetSymbol, string[]> = {
  NVDAx: ["nvdax", "nvda", "nvidia"],
  TSLAx: ["tslax", "tsla", "tesla"],
  AAPLx: ["aaplx", "aapl", "apple"],
  COINx: ["coinx", "coin", "coinbase"],
  HOODx: ["hoodx", "hood", "robinhood"],
};

export function detectAssets(question: string): AssetSymbol[] {
  const q = question.toLowerCase();
  const hits: AssetSymbol[] = [];
  for (const sym of Object.keys(ALIASES) as AssetSymbol[]) {
    if (ALIASES[sym].some((a) => q.includes(a))) hits.push(sym);
  }
  return hits;
}

export interface AskResult {
  answer: string;
  source: "qwen" | "deterministic";
  model?: string;
  referencedAssets: AssetSymbol[];
  dataSource: "live" | "sim";
}

function grounding(decisions: DecisionPacket[], crowding: CrowdingIndex) {
  return {
    market: {
      agent_crowding_index: crowding.index,
      state: crowding.state,
      recommendation: crowding.recommendation,
    },
    assets: decisions.map((p) => ({
      asset: p.asset,
      regime: p.marketRegime,
      selected_strategy: p.selectedStrategy,
      final_action: p.finalAction,
      direction: p.direction,
      crowd_score: p.scores.crowdScore,
      fair_value_gap_pct: p.scores.fairValueGapPct,
      strategy_confidence: p.scores.strategyConfidence,
      token_price: p.market.tokenPrice,
      underlying_price: p.market.underlyingPrice,
      rejected: p.rejectedStrategies.map((r) => `${r.strategy}: ${r.reason}`),
      rationale: p.rationale,
    })),
  };
}

// --- Deterministic fallback (no LLM) -------------------------------------

function deterministicAnswer(
  question: string,
  decisions: DecisionPacket[],
  crowding: CrowdingIndex,
  referenced: AssetSymbol[],
): string {
  const q = question.toLowerCase();
  const byAsset = new Map(decisions.map((d) => [d.asset, d]));

  // Asset-specific question.
  if (referenced.length > 0) {
    return referenced
      .map((sym) => {
        const p = byAsset.get(sym);
        if (!p) return `${sym}: no current decision.`;
        const why = p.rejectedStrategies.map((r) => `${r.strategy} (${r.reason})`).join("; ");
        const lead =
          p.finalAction === "no_trade"
            ? `${sym} is in a ${p.marketRegime} regime and CounterFlow is standing aside (No-Trade).`
            : `${sym} is in a ${p.marketRegime} regime — CounterFlow selected ${p.selectedStrategy}, ${p.direction.toUpperCase()}.`;
        return `${lead} CrowdScore ${p.scores.crowdScore}, fair-value gap ${pct(
          p.scores.fairValueGapPct,
        )}, confidence ${(p.scores.strategyConfidence * 100).toFixed(0)}% (council ${p.agentAgreement.agree}/${p.agentAgreement.total}). ${p.rationale} Rejected: ${why}.`;
      })
      .join("\n\n");
  }

  // "Most overvalued / cheapest" style.
  if (/overvalued|expensive|rich|cheap|undervalued|gap|mispriced/.test(q)) {
    const sorted = [...decisions].sort(
      (a, b) => b.scores.fairValueGapPct - a.scores.fairValueGapPct,
    );
    const rich = sorted[0];
    const cheap = sorted[sorted.length - 1];
    return `By fair-value gap: ${rich.asset} is the most expensive vs its underlying (${pct(
      rich.scores.fairValueGapPct,
    )}), ${cheap.asset} the cheapest (${pct(cheap.scores.fairValueGapPct)}). ${
      Math.abs(cheap.scores.fairValueGapPct) >= 1.5 || Math.abs(rich.scores.fairValueGapPct) >= 1.5
        ? "A gap past ~1.5% is where Fair-Value Convergence becomes eligible."
        : "All gaps are within normal range, so convergence isn't triggered."
    }`;
  }

  // "Crowded / hype" style.
  if (/crowd|hype|overreact|froth|bubble/.test(q)) {
    const sorted = [...decisions].sort((a, b) => b.scores.crowdScore - a.scores.crowdScore);
    const top = sorted[0];
    return `Market-wide Agent Crowding Index is ${crowding.index}/100 (${crowding.state}). ${crowding.recommendation} Most crowded asset: ${top.asset} (CrowdScore ${top.scores.crowdScore}).`;
  }

  // General market / "what should I trade".
  const actionable = decisions.filter((d) => d.finalAction !== "no_trade");
  const board = decisions.map((d) => `${d.asset} → ${d.marketRegime} → ${d.finalAction === "no_trade" ? "No-Trade" : d.selectedStrategy + " " + d.direction}`).join("; ");
  return `Agent Crowding Index ${crowding.index}/100 (${crowding.state}). ${
    actionable.length
      ? `${actionable.length} actionable setup(s): ${actionable.map((d) => `${d.asset} ${d.direction} (${d.selectedStrategy})`).join(", ")}.`
      : "No actionable setups right now — the system is disciplined and standing aside."
  } Board: ${board}.`;
}

// --- Main ----------------------------------------------------------------

export async function answerQuestion(
  question: string,
  decisions: DecisionPacket[],
  crowding: CrowdingIndex,
  dataSource: "live" | "sim",
  useLLM = true,
): Promise<AskResult> {
  const referenced = detectAssets(question);
  const deterministic = deterministicAnswer(question, decisions, crowding, referenced);

  if (!useLLM || !qwenConfigured()) {
    return { answer: deterministic, source: "deterministic", referencedAssets: referenced, dataSource };
  }

  try {
    const system = [
      "You are CounterFlow OS, an autonomous strategy-routing trading agent for 24/7 tokenized US stocks.",
      "Answer the user's question using ONLY the engine output provided as JSON. NEVER invent prices, scores, regimes, or strategies — quote the numbers from the data.",
      "Be concise (<= 130 words), specific, and neutral. Reference the regime, selected strategy, CrowdScore, and fair-value gap where relevant.",
      "This is paper/simulation, not financial advice — say so briefly if the user asks whether to buy/sell.",
      'Respond as JSON: {"answer": string}.',
    ].join(" ");
    const user = JSON.stringify({ question, engine_output: grounding(decisions, crowding) });

    const raw = await qwenChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { json: true, temperature: 0.3, maxTokens: 400 },
    );
    const parsed = extractJson<{ answer?: string }>(raw);
    if (parsed?.answer) {
      return {
        answer: parsed.answer.trim(),
        source: "qwen",
        model: qwenModel(),
        referencedAssets: referenced,
        dataSource,
      };
    }
    return { answer: deterministic, source: "deterministic", referencedAssets: referenced, dataSource };
  } catch {
    return { answer: deterministic, source: "deterministic", referencedAssets: referenced, dataSource };
  }
}

export const SUGGESTED_QUESTIONS = [
  "What regime is the market in right now?",
  "Which tokenized stock is most mispriced vs its underlying?",
  "Why is the system standing aside on most assets?",
  "Is NVDAx a buy right now?",
  "How crowded is the market?",
];
