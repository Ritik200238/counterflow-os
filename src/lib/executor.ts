import type { Direction, ExitReason, PricePoint, TradeStatus } from "@/lib/types";
import { minutesBetween } from "@/lib/util/time";
import { round } from "@/lib/util/num";

// Paper-trading executor. Given an opened position and the forward price path,
// it walks the path and closes the trade on stop-loss, take-profit, or time
// limit — then books PnL net of estimated costs. Paper/sim only (PRD §6).

export interface ExecutionPlan {
  direction: Direction;
  entryPrice: number;
  entryTime: string;
  stopLossPct: number;
  takeProfitPct: number;
  positionSizePct: number;
  costPct: number; // round-trip cost estimate (spread + fees + slippage)
}

export interface ExecutionResult {
  status: TradeStatus;
  exitPrice: number | null;
  exitReason: ExitReason;
  pnlPct: number | null; // return on position notional, net of costs
  pnlValue: number | null; // portfolio contribution = pnlPct * size / 100
  holdMinutes: number | null;
}

export function noTradeResult(): ExecutionResult {
  return {
    status: "no_trade",
    exitPrice: null,
    exitReason: "none",
    pnlPct: null,
    pnlValue: null,
    holdMinutes: null,
  };
}

// Live mode: a trade is opened against real-time data but cannot be resolved
// against a known future, so it stays open with no fabricated PnL.
export function openResult(): ExecutionResult {
  return {
    status: "open",
    exitPrice: null,
    exitReason: "none",
    pnlPct: null,
    pnlValue: null,
    holdMinutes: null,
  };
}

export function resolveTrade(
  plan: ExecutionPlan,
  forwardPath: PricePoint[],
): ExecutionResult {
  const sign = plan.direction === "long" ? 1 : -1;
  const stopPrice =
    plan.direction === "long"
      ? plan.entryPrice * (1 - plan.stopLossPct / 100)
      : plan.entryPrice * (1 + plan.stopLossPct / 100);
  const takePrice =
    plan.direction === "long"
      ? plan.entryPrice * (1 + plan.takeProfitPct / 100)
      : plan.entryPrice * (1 - plan.takeProfitPct / 100);

  let exitPrice = plan.entryPrice;
  let exitTime = plan.entryTime;
  let exitReason: ExitReason = "time_limit";

  for (const point of forwardPath) {
    const hitStop =
      plan.direction === "long" ? point.price <= stopPrice : point.price >= stopPrice;
    const hitTake =
      plan.direction === "long" ? point.price >= takePrice : point.price <= takePrice;

    if (hitStop && hitTake) {
      // Both crossed within the same bar — assume stop fills first (conservative).
      exitPrice = stopPrice;
      exitTime = point.t;
      exitReason = "stop_loss";
      break;
    }
    if (hitStop) {
      exitPrice = stopPrice;
      exitTime = point.t;
      exitReason = "stop_loss";
      break;
    }
    if (hitTake) {
      exitPrice = takePrice;
      exitTime = point.t;
      exitReason = "take_profit";
      break;
    }
    exitPrice = point.price;
    exitTime = point.t;
  }

  const grossPct = (sign * (exitPrice - plan.entryPrice)) / plan.entryPrice * 100;
  const pnlPct = round(grossPct - plan.costPct, 3);
  const pnlValue = round((pnlPct * plan.positionSizePct) / 100, 4);

  return {
    status: "closed",
    exitPrice: round(exitPrice, 4),
    exitReason,
    pnlPct,
    pnlValue,
    holdMinutes: minutesBetween(plan.entryTime, exitTime),
  };
}
