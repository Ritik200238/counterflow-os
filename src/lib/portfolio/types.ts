import type { AssetSymbol, Direction, ExitReason, Strategy } from "@/lib/types";

// Live paper-portfolio model. The autonomous agent opens positions from real
// (Bitget) prices, marks them to market each tick, and closes them on
// stop/take/time. Paper / simulation only — no real capital.

export interface Position {
  id: string;
  asset: AssetSymbol;
  strategy: Strategy;
  direction: Direction; // long | short
  entryPrice: number;
  entryTime: string;
  stopLossPct: number;
  takeProfitPct: number;
  costPct: number; // round-trip cost booked on close
  sizePct: number; // % of equity at entry
  sizeUsd: number; // notional at entry
  status: "open" | "closed";
  exitPrice: number | null;
  exitTime: string | null;
  exitReason: ExitReason;
  pnlPct: number | null; // return on the position, net of cost
  pnlUsd: number | null;
}

export interface Portfolio {
  startingCapital: number;
  realizedPnlUsd: number;
  positions: Position[]; // open + closed history (newest appended)
  updatedAt: string;
}

// Computed view (marked to current prices) returned to the UI.
export interface PortfolioSnapshot {
  startingCapital: number;
  cashUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  equityUsd: number;
  totalReturnPct: number;
  exposurePct: number;
  openCount: number;
  closedCount: number;
  winRate: number | null;
  open: PositionView[];
  closed: PositionView[];
  updatedAt: string;
}

export interface PositionView extends Position {
  markPrice: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
}

export const STARTING_CAPITAL = 100_000;
export const MAX_HOLD_HOURS = 72;

export function emptyPortfolio(now: string): Portfolio {
  return { startingCapital: STARTING_CAPITAL, realizedPnlUsd: 0, positions: [], updatedAt: now };
}
