import type { LedgerEntry, Strategy } from "@/lib/types";
import { clamp, round } from "@/lib/util/num";

// Strategy Autopilot (PRD §35). Walks the ledger chronologically and, on a rolling
// window of trailing trades, reallocates paper capital across strategies — leaning
// into what's working in the recent regime mix and trimming what isn't, with a
// cash floor for No-Trade / Risk-Off. Produces the allocation *timeline* (so you
// can see it rotate) plus rotation notes when the dominant strategy changes.

const ACTIVE: Strategy[] = [
  "Momentum Follow",
  "CounterFlow Fade",
  "Fair-Value Convergence",
  "Volatility Breakout",
  "Earnings Drift",
  "Macro Rebalance",
];
const CASH: Strategy = "No-Trade / Risk-Off";
const CASH_FLOOR = 15;

export interface AllocationPoint {
  t: string;
  weights: Record<Strategy, number>;
}

export interface AutopilotResult {
  timeline: AllocationPoint[];
  current: Record<Strategy, number>;
  notes: string[];
  window: number;
}

function weightsFromWindow(windowTrades: LedgerEntry[]): Record<Strategy, number> {
  const score = new Map<Strategy, number>();
  for (const s of ACTIVE) {
    const own = windowTrades.filter(
      (e) => e.selectedStrategy === s && e.status === "closed" && e.pnlPct !== null,
    );
    if (own.length === 0) {
      score.set(s, 0.1); // cold-start probe allocation
      continue;
    }
    const wins = own.filter((e) => (e.pnlPct as number) > 0).length;
    const winRate = wins / own.length;
    const avg = own.reduce((a, e) => a + (e.pnlPct as number), 0) / own.length;
    score.set(s, Math.max(0.05, winRate * (1 + clamp(avg, -1, 1) / 2)));
  }
  const total = [...score.values()].reduce((a, b) => a + b, 0) || 1;

  const weights = {} as Record<Strategy, number>;
  let allocated = 0;
  for (const s of ACTIVE) {
    const w = round(((score.get(s) as number) / total) * (100 - CASH_FLOOR), 0);
    weights[s] = w;
    allocated += w;
  }
  weights[CASH] = Math.max(0, 100 - allocated);
  return weights;
}

function dominant(weights: Record<Strategy, number>): Strategy {
  return ACTIVE.reduce((best, s) => (weights[s] > weights[best] ? s : best), ACTIVE[0]);
}

export function computeAutopilot(entries: LedgerEntry[], window = 40, step = 12): AutopilotResult {
  const closed = entries
    .filter((e) => e.status === "closed" && e.pnlPct !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const timeline: AllocationPoint[] = [];
  const notes: string[] = [];
  let lastDominant: Strategy | null = null;

  if (closed.length === 0) {
    const flat = { ...weightsFromWindow([]) };
    return { timeline: [], current: flat, notes: ["No closed trades yet — allocation is a cold-start probe."], window };
  }

  for (let i = Math.min(window, closed.length); i <= closed.length; i += step) {
    const win = closed.slice(Math.max(0, i - window), i);
    const weights = weightsFromWindow(win);
    const t = closed[i - 1].timestamp;
    timeline.push({ t, weights });

    const dom = dominant(weights);
    if (lastDominant && dom !== lastDominant) {
      notes.push(
        `${t.slice(0, 10)}: autopilot rotated to ${dom} (${weights[dom]}% weight) as the regime mix shifted.`,
      );
    }
    lastDominant = dom;
  }

  // Ensure the final point reflects the full trailing window.
  const finalWeights = weightsFromWindow(closed.slice(Math.max(0, closed.length - window)));
  const current = finalWeights;
  if (timeline.length === 0 || timeline[timeline.length - 1].t !== closed[closed.length - 1].timestamp) {
    timeline.push({ t: closed[closed.length - 1].timestamp, weights: finalWeights });
  }

  if (notes.length === 0) notes.push("Allocation stable — no dominant-strategy rotation in this period.");

  return { timeline, current, notes, window };
}
