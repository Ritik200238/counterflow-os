// CounterFlow OS — core domain model.
// Every module in the engine speaks these types. Kept deliberately explicit:
// the system's value is an auditable decision trail, so the shapes are the contract.

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export type AssetSymbol = "NVDAx" | "TSLAx" | "AAPLx" | "COINx" | "HOODx";

export const ASSET_SYMBOLS: AssetSymbol[] = [
  "NVDAx",
  "TSLAx",
  "AAPLx",
  "COINx",
  "HOODx",
];

export interface AssetMeta {
  symbol: AssetSymbol;
  underlying: string; // "NVDA"
  name: string;
  sector: string;
  note: string; // why it's in the universe (PRD §9)
}

// ---------------------------------------------------------------------------
// Market snapshot — the raw inputs every agent reads
// ---------------------------------------------------------------------------

export interface MarketSnapshot {
  symbol: AssetSymbol;
  timestamp: string; // ISO

  // Pricing
  tokenPrice: number; // tokenized-stock price (24/7)
  estimatedFairValue: number; // model fair value from underlying + proxies
  underlyingPrice: number; // last known underlying equity price (may be stale)
  underlyingMarketOpen: boolean; // is Nasdaq/NYSE open right now

  // Microstructure
  spreadPct: number; // bid/ask spread, %
  volume: number; // recent token volume
  avgVolume: number; // baseline volume
  priceVelocityPct: number; // recent % move (signed) — momentum proxy
  volatilityPct: number; // realized volatility, %

  // Cross-market confirmation
  sectorIndexChangePct: number; // sector ETF / index move, %
  sectorConfirmation: number; // 0..1 — how well sector confirms the token move
  nasdaqFuturesChangePct: number;

  // News / sentiment
  newsIntensity: number; // 0..1 — volume + freshness of news
  newsSentiment: number; // -1..1
  newsEvidenceQuality: number; // 0..1 — strong fundamental vs vague hype
  socialHypeSpike: number; // 0..1

  // Macro / events
  macroEventActive: boolean; // FOMC/CPI/jobs/Fed within window
  macroEventLabel?: string;
  earningsEventActive: boolean;
  earningsEventLabel?: string;
  yieldsChangeBps: number; // 10y yield change, bps
  dxyChangePct: number; // dollar index move, %

  // Data quality
  dataFreshnessSec: number; // age of the freshest input, seconds
}

export interface PricePoint {
  t: string; // ISO timestamp
  price: number;
}

export interface AssetMarketData {
  meta: AssetMeta;
  snapshot: MarketSnapshot;
  forwardPath: PricePoint[]; // future token prices used to resolve paper trades
}

// ---------------------------------------------------------------------------
// Proprietary scores (PRD §12)
// ---------------------------------------------------------------------------

export interface Scores {
  crowdScore: number; // 0..100 — likelihood the move is crowded/bot-driven
  fairValueGapPct: number; // signed % — (token - fair) / fair
  liquidityScore: number; // 0..1 — higher = more tradable
  regimeConfidence: number; // 0..1
  strategyConfidence: number; // 0..1
  riskScore: number; // 0..1 — higher = riskier
}

// ---------------------------------------------------------------------------
// Market regimes (PRD §10)
// ---------------------------------------------------------------------------

export type Regime =
  | "Clean Trend"
  | "Crowded Hype"
  | "Fair-Value Gap"
  | "Macro Shock"
  | "Earnings Event"
  | "Noise";

export const REGIMES: Regime[] = [
  "Clean Trend",
  "Crowded Hype",
  "Fair-Value Gap",
  "Macro Shock",
  "Earnings Event",
  "Noise",
];

export interface RegimeResult {
  regime: Regime;
  confidence: number; // 0..1
  signals: string[]; // human-readable matched signals
  fit: Record<Regime, number>; // raw fit score per regime (for transparency)
}

// ---------------------------------------------------------------------------
// Strategies (PRD §11)
// ---------------------------------------------------------------------------

export type Strategy =
  | "CounterFlow Fade"
  | "Momentum Follow"
  | "Fair-Value Convergence"
  | "No-Trade / Risk-Off";

export const STRATEGIES: Strategy[] = [
  "CounterFlow Fade",
  "Momentum Follow",
  "Fair-Value Convergence",
  "No-Trade / Risk-Off",
];

export type Direction = "long" | "short" | "flat";

// ---------------------------------------------------------------------------
// Multi-agent strategy council (PRD §13)
// ---------------------------------------------------------------------------

export type AgentName =
  | "Macro"
  | "News"
  | "Fair-Value"
  | "Crowd"
  | "Technical"
  | "Liquidity"
  | "Risk"
  | "Strategy Router";

// A normalized stance lets us measure council agreement across heterogeneous agents.
export type Stance = "follow" | "fade" | "converge" | "avoid" | "neutral";

export interface AgentVote {
  stance: Stance;
  confidence: number; // 0..1
}

export interface AgentOutput {
  agent: AgentName;
  vote: AgentVote;
  summary: string; // short rationale (deterministic baseline, optionally LLM-enriched)
  data: Record<string, number | string | boolean>; // agent-specific structured fields (PRD JSON)
}

// ---------------------------------------------------------------------------
// Risk governor (PRD §14)
// ---------------------------------------------------------------------------

export type RiskState = "Normal" | "Caution" | "Risk-Off" | "Kill Switch";

export interface RiskDecision {
  approved: boolean;
  riskState: RiskState;
  positionSizePct: number; // % of portfolio
  stopLossPct: number;
  takeProfitPct: number;
  maxLossPct: number;
  reasons: string[]; // why approved / reduced
  blocks: string[]; // hard-rule violations that block the trade
}

// ---------------------------------------------------------------------------
// Strategy router output (PRD §13.8)
// ---------------------------------------------------------------------------

export interface RejectedStrategy {
  strategy: Strategy;
  reason: string;
}

export interface StrategySelection {
  selectedStrategy: Strategy;
  direction: Direction;
  confidence: number;
  rejectedStrategies: RejectedStrategy[];
  reason: string;
}

// ---------------------------------------------------------------------------
// Trade Decision Packet — the proof packet (PRD §32–33)
// ---------------------------------------------------------------------------

export type FinalAction = "long_paper" | "short_paper" | "no_trade";

export interface DecisionPacket {
  decisionId: string; // cfos_YYYY_NNNN
  timestamp: string;
  asset: AssetSymbol;

  marketRegime: Regime;
  regimeConfidence: number;
  regimeSignals: string[];

  selectedStrategy: Strategy;
  rejectedStrategies: RejectedStrategy[];
  direction: Direction;

  scores: {
    crowdScore: number;
    fairValueGapPct: number;
    regimeConfidence: number;
    strategyConfidence: number;
    liquidityScore: number;
    riskScore: number;
  };

  market: {
    tokenPrice: number;
    estimatedFairValue: number;
    underlyingPrice: number;
    underlyingMarketOpen: boolean;
    spreadPct: number;
  };

  council: AgentOutput[];
  agentAgreement: { agree: number; total: number };

  risk: RiskDecision;

  finalAction: FinalAction;
  rationale: string; // headline rationale
  debate: string; // multi-agent debate narrative
  reasoningSource: "qwen" | "deterministic";
  reasoningModel?: string;

  dataFreshness: "Passed" | "Failed";
  dataSourcesUsed: string[];
}

// ---------------------------------------------------------------------------
// Paper-trading ledger (PRD §15)
// ---------------------------------------------------------------------------

export type TradeStatus = "open" | "closed" | "no_trade";
export type ExitReason =
  | "take_profit"
  | "stop_loss"
  | "time_limit"
  | "regime_exit"
  | "none";

export interface LedgerEntry {
  decisionId: string;
  timestamp: string;
  asset: AssetSymbol;
  tokenPrice: number;
  estimatedFairValue: number;
  fairValueGapPct: number;
  marketRegime: Regime;
  selectedStrategy: Strategy;
  rejectedStrategies: string[];
  crowdScore: number;
  regimeConfidence: number;
  strategyConfidence: number;
  liquidityScore: number;
  direction: Direction;
  entryPrice: number | null;
  exitPrice: number | null;
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  pnlPct: number | null; // return on position notional (after costs), %
  pnlValue: number | null; // portfolio contribution = pnlPct * positionSizePct / 100
  status: TradeStatus;
  exitReason: ExitReason;
  holdMinutes: number | null;
  agentRationale: string;
  dataSourcesUsed: string[];
  riskState: RiskState;
}

// ---------------------------------------------------------------------------
// Strategy performance memory (PRD §17) + autopilot (PRD §35)
// ---------------------------------------------------------------------------

export interface StrategyMemoryRow {
  strategy: Strategy;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null; // 0..1
  avgReturnPct: number | null;
  bestRegime: Regime | null;
  worstRegime: Regime | null;
  currentWeight: number; // autopilot allocation, %
}

export interface StrategyMemory {
  rows: StrategyMemoryRow[];
  totalClosed: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Agent Crowding Index — market-wide (PRD §34)
// ---------------------------------------------------------------------------

export type CrowdingState =
  | "Low"
  | "Moderate"
  | "Elevated"
  | "High AI-agent crowding";

export interface CrowdingComponent {
  label: string;
  value: number; // 0..100 contribution
  weight: number; // 0..1
}

export interface CrowdingIndex {
  index: number; // 0..100
  state: CrowdingState;
  extremeAssets: number;
  recommendation: string;
  components: CrowdingComponent[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Aggregate ledger stats (for the ledger page)
// ---------------------------------------------------------------------------

export interface LedgerStats {
  totalDecisions: number;
  totalTrades: number; // executed (not no-trade)
  closedTrades: number;
  openTrades: number;
  noTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgReturnPct: number | null;
  totalPnlValue: number; // sum of portfolio contributions
  maxDrawdownPct: number;
  byStrategy: StrategyMemoryRow[];
  byRegime: { regime: Regime; trades: number; winRate: number | null; avgReturnPct: number | null }[];
}
