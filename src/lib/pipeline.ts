import type {
  AssetMarketData,
  CrowdingIndex,
  DecisionPacket,
  FinalAction,
  LedgerEntry,
} from "@/lib/types";
import { computeSignals, type Signals } from "@/lib/context";
import { runCouncil } from "@/lib/council";
import { routeStrategy } from "@/lib/router";
import { riskGovernor, RISK_LIMITS } from "@/lib/governor";
import { generateReasoning } from "@/lib/llm/reasoning";
import { noTradeResult, resolveTrade, type ExecutionPlan } from "@/lib/executor";
import { computeCrowdingIndex } from "@/lib/crowding";
import { generateBoard } from "@/lib/market/generator";
import { round } from "@/lib/util/num";

// The scan pipeline: one snapshot in, one auditable Trade Decision Packet out
// (PRD §8.1 system loop). This is where every module composes —
// signals -> council -> router -> risk governor -> execution -> reasoning -> packet.

const DATA_SOURCES = [
  "tokenized price feed (sim)",
  "underlying equity proxy",
  "sector index / ETF",
  "Nasdaq futures",
  "news & sentiment feed",
  "macro/earnings calendar",
];

export interface ScanOptions {
  decisionId: string;
  useLLM?: boolean;
  portfolioExposurePct?: number;
  dailyDrawdownPct?: number;
}

export interface ScanOutcome {
  packet: DecisionPacket;
  ledgerEntry: LedgerEntry;
}

export async function scanAsset(
  market: AssetMarketData,
  opts: ScanOptions,
): Promise<ScanOutcome> {
  const sig: Signals = computeSignals(market.snapshot);
  const council = runCouncil(sig);
  const router = routeStrategy(sig, council);
  const risk = riskGovernor(sig, router, {
    portfolioExposurePct: opts.portfolioExposurePct,
    dailyDrawdownPct: opts.dailyDrawdownPct,
  });

  // Final action: the router may want a trade, but the risk governor has the last word.
  let finalAction: FinalAction;
  if (router.selectedStrategy === "No-Trade / Risk-Off" || !risk.approved) {
    finalAction = "no_trade";
  } else {
    finalAction = router.direction === "short" ? "short_paper" : "long_paper";
  }

  // Resolve the paper trade against the forward price path.
  const s = sig.snapshot;
  let execution = noTradeResult();
  if (finalAction !== "no_trade") {
    const costPct = round(s.spreadPct + sig.liquidity.slippageEstimatePct + 0.02, 3);
    const plan: ExecutionPlan = {
      direction: router.direction,
      entryPrice: s.tokenPrice,
      entryTime: s.timestamp,
      stopLossPct: risk.stopLossPct,
      takeProfitPct: risk.takeProfitPct,
      positionSizePct: risk.positionSizePct,
      costPct,
    };
    execution = resolveTrade(plan, market.forwardPath);
  }

  const dataFreshness =
    s.dataFreshnessSec <= RISK_LIMITS.maxDataAgeSec ? "Passed" : "Failed";

  const reasoning = await generateReasoning(
    {
      asset: market.meta.symbol,
      regime: sig.regime.regime,
      regimeConfidence: sig.regime.confidence,
      crowdScore: sig.crowd.score,
      fairValueGapPct: sig.gapPct,
      selectedStrategy: router.selectedStrategy,
      direction: router.direction,
      rejectedStrategies: router.rejectedStrategies,
      council,
      agreement: router.agreement,
      risk,
      finalAction,
    },
    opts.useLLM ?? false,
  );

  const fullCouncil = [...council, router.routerAgent];

  const packet: DecisionPacket = {
    decisionId: opts.decisionId,
    timestamp: s.timestamp,
    asset: market.meta.symbol,
    marketRegime: sig.regime.regime,
    regimeConfidence: sig.regime.confidence,
    regimeSignals: sig.regime.signals,
    selectedStrategy: router.selectedStrategy,
    rejectedStrategies: router.rejectedStrategies,
    direction: router.direction,
    scores: {
      crowdScore: sig.crowd.score,
      fairValueGapPct: sig.gapPct,
      regimeConfidence: sig.regime.confidence,
      strategyConfidence: router.confidence,
      liquidityScore: sig.liquidity.score,
      riskScore: sig.risk.score,
    },
    market: {
      tokenPrice: s.tokenPrice,
      estimatedFairValue: s.estimatedFairValue,
      underlyingPrice: s.underlyingPrice,
      underlyingMarketOpen: s.underlyingMarketOpen,
      spreadPct: s.spreadPct,
    },
    council: fullCouncil,
    agentAgreement: router.agreement,
    risk,
    finalAction,
    rationale: reasoning.rationale,
    debate: reasoning.debate,
    reasoningSource: reasoning.source,
    reasoningModel: reasoning.model,
    dataFreshness,
    dataSourcesUsed: DATA_SOURCES,
  };

  const ledgerEntry: LedgerEntry = {
    decisionId: opts.decisionId,
    timestamp: s.timestamp,
    asset: market.meta.symbol,
    tokenPrice: s.tokenPrice,
    estimatedFairValue: s.estimatedFairValue,
    fairValueGapPct: sig.gapPct,
    marketRegime: sig.regime.regime,
    selectedStrategy: router.selectedStrategy,
    rejectedStrategies: router.rejectedStrategies.map((r) => r.strategy),
    crowdScore: sig.crowd.score,
    regimeConfidence: sig.regime.confidence,
    strategyConfidence: router.confidence,
    liquidityScore: sig.liquidity.score,
    direction: finalAction === "no_trade" ? "flat" : router.direction,
    entryPrice: finalAction === "no_trade" ? null : s.tokenPrice,
    exitPrice: execution.exitPrice,
    positionSizePct: risk.positionSizePct,
    stopLossPct: risk.stopLossPct,
    takeProfitPct: risk.takeProfitPct,
    pnlPct: execution.pnlPct,
    pnlValue: execution.pnlValue,
    status: execution.status,
    exitReason: execution.exitReason,
    holdMinutes: execution.holdMinutes,
    agentRationale: reasoning.rationale,
    dataSourcesUsed: DATA_SOURCES,
    riskState: risk.riskState,
  };

  return { packet, ledgerEntry };
}

export interface BoardResult {
  decisions: ScanOutcome[];
  crowdingIndex: CrowdingIndex;
  generatedAt: string;
  timestamp: string;
}

export async function scanBoard(opts?: {
  useLLM?: boolean;
  startSeq?: number;
  seed?: string;
  timestamp?: string;
}): Promise<BoardResult> {
  const board = generateBoard(opts?.seed, opts?.timestamp);
  const startSeq = opts?.startSeq ?? 1;
  const year = new Date(board[0].snapshot.timestamp).getUTCFullYear();

  const decisions = await Promise.all(
    board.map((market, i) =>
      scanAsset(market, {
        decisionId: `cfos_${year}_${String(startSeq + i).padStart(4, "0")}`,
        useLLM: opts?.useLLM ?? false,
      }),
    ),
  );

  const signalsList = board.map((m) => computeSignals(m.snapshot));
  const crowdingIndex = computeCrowdingIndex(signalsList);

  return {
    decisions,
    crowdingIndex,
    generatedAt: new Date().toISOString(),
    timestamp: board[0].snapshot.timestamp,
  };
}
