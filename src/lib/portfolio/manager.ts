import type { AssetSymbol, DecisionPacket, Direction } from "@/lib/types";
import type { Portfolio, PortfolioSnapshot, Position, PositionView } from "@/lib/portfolio/types";
import { MAX_HOLD_HOURS } from "@/lib/portfolio/types";
import { round } from "@/lib/util/num";
import { minutesBetween } from "@/lib/util/time";

const sign = (d: Direction) => (d === "long" ? 1 : -1);

function grossPct(direction: Direction, entry: number, mark: number): number {
  return (sign(direction) * (mark - entry)) / entry * 100;
}

function unrealizedUsd(pos: Position, mark: number): number {
  return round((pos.sizeUsd * grossPct(pos.direction, pos.entryPrice, mark)) / 100, 2);
}

export function hasOpen(p: Portfolio, asset: AssetSymbol): boolean {
  return p.positions.some((x) => x.asset === asset && x.status === "open");
}

/** Open a position from an actionable decision, sized against current equity. */
export function openPosition(
  p: Portfolio,
  packet: DecisionPacket,
  equityUsd: number,
  nowMs: number,
): Position | null {
  if (packet.finalAction === "no_trade") return null;
  if (hasOpen(p, packet.asset)) return null;

  const sizeUsd = round((equityUsd * packet.risk.positionSizePct) / 100, 2);
  const pos: Position = {
    id: `${packet.asset}-${nowMs}`,
    asset: packet.asset,
    strategy: packet.selectedStrategy,
    direction: packet.direction,
    entryPrice: packet.market.tokenPrice,
    entryTime: new Date(nowMs).toISOString(),
    stopLossPct: packet.risk.stopLossPct,
    takeProfitPct: packet.risk.takeProfitPct,
    costPct: round(packet.market.spreadPct + 0.05, 3),
    sizePct: packet.risk.positionSizePct,
    sizeUsd,
    status: "open",
    exitPrice: null,
    exitTime: null,
    exitReason: "none",
    pnlPct: null,
    pnlUsd: null,
  };
  p.positions.push(pos);
  return pos;
}

/** Mark open positions to current prices; close any that hit stop / take / time. */
export function tickPositions(
  p: Portfolio,
  marks: Map<AssetSymbol, number>,
  nowIso: string,
): { closed: Position[] } {
  const closed: Position[] = [];
  for (const pos of p.positions) {
    if (pos.status !== "open") continue;
    const mark = marks.get(pos.asset);
    if (mark == null) continue;

    const stopPrice =
      pos.direction === "long"
        ? pos.entryPrice * (1 - pos.stopLossPct / 100)
        : pos.entryPrice * (1 + pos.stopLossPct / 100);
    const takePrice =
      pos.direction === "long"
        ? pos.entryPrice * (1 + pos.takeProfitPct / 100)
        : pos.entryPrice * (1 - pos.takeProfitPct / 100);

    const hitStop = pos.direction === "long" ? mark <= stopPrice : mark >= stopPrice;
    const hitTake = pos.direction === "long" ? mark >= takePrice : mark <= takePrice;
    const heldMin = minutesBetween(pos.entryTime, nowIso);

    let reason: Position["exitReason"] | null = null;
    let exit = mark;
    if (hitStop) {
      reason = "stop_loss";
      exit = stopPrice;
    } else if (hitTake) {
      reason = "take_profit";
      exit = takePrice;
    } else if (heldMin >= MAX_HOLD_HOURS * 60) {
      reason = "time_limit";
      exit = mark;
    }

    if (reason) {
      const pnlPct = round(grossPct(pos.direction, pos.entryPrice, exit) - pos.costPct, 3);
      const pnlUsd = round((pos.sizeUsd * pnlPct) / 100, 2);
      pos.status = "closed";
      pos.exitPrice = round(exit, 4);
      pos.exitTime = nowIso;
      pos.exitReason = reason;
      pos.pnlPct = pnlPct;
      pos.pnlUsd = pnlUsd;
      p.realizedPnlUsd = round(p.realizedPnlUsd + pnlUsd, 2);
      closed.push(pos);
    }
  }
  p.updatedAt = nowIso;
  return { closed };
}

export function snapshot(p: Portfolio, marks: Map<AssetSymbol, number>): PortfolioSnapshot {
  const open = p.positions.filter((x) => x.status === "open");
  const closed = p.positions.filter((x) => x.status === "closed");

  let unrealized = 0;
  const openViews: PositionView[] = open.map((pos) => {
    const mark = marks.get(pos.asset) ?? null;
    const u = mark != null ? unrealizedUsd(pos, mark) : null;
    if (u != null) unrealized += u;
    return {
      ...pos,
      markPrice: mark,
      unrealizedPnlUsd: u,
      unrealizedPnlPct: mark != null ? round(grossPct(pos.direction, pos.entryPrice, mark), 3) : null,
    };
  });

  const committed = round(open.reduce((a, x) => a + x.sizeUsd, 0), 2);
  const equity = round(p.startingCapital + p.realizedPnlUsd + unrealized, 2);
  const cash = round(p.startingCapital + p.realizedPnlUsd - committed, 2);
  const wins = closed.filter((x) => (x.pnlUsd ?? 0) > 0).length;

  const closedViews: PositionView[] = closed
    .slice()
    .reverse()
    .map((pos) => ({ ...pos, markPrice: pos.exitPrice, unrealizedPnlUsd: null, unrealizedPnlPct: null }));

  return {
    startingCapital: p.startingCapital,
    cashUsd: cash,
    realizedPnlUsd: round(p.realizedPnlUsd, 2),
    unrealizedPnlUsd: round(unrealized, 2),
    equityUsd: equity,
    totalReturnPct: round(((equity - p.startingCapital) / p.startingCapital) * 100, 3),
    exposurePct: equity > 0 ? round((committed / equity) * 100, 1) : 0,
    openCount: open.length,
    closedCount: closed.length,
    winRate: closed.length ? round(wins / closed.length, 3) : null,
    open: openViews,
    closed: closedViews,
    updatedAt: p.updatedAt,
  };
}

export function currentEquity(p: Portfolio, marks: Map<AssetSymbol, number>): number {
  let unrealized = 0;
  for (const pos of p.positions) {
    if (pos.status !== "open") continue;
    const mark = marks.get(pos.asset);
    if (mark != null) unrealized += unrealizedUsd(pos, mark);
  }
  return p.startingCapital + p.realizedPnlUsd + unrealized;
}
