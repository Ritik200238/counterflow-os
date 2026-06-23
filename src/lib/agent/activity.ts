import type { AssetSymbol, CrowdingIndex, DecisionPacket } from "@/lib/types";
import { pct } from "@/lib/util/num";

// Turns a board scan into an "agent tick" — what an autonomous agent would
// surface each cycle: its posture, the actionable setups it found, and proactive
// alerts (extreme crowding, large tracking errors, risk-blocked trades). This is
// what makes the system feel like it's operating on its own, not just rendering.

export type AlertLevel = "signal" | "warn" | "info";

export interface AgentAlert {
  level: AlertLevel;
  text: string;
  asset?: AssetSymbol;
}

export interface AgentTick {
  posture: string;
  crowdingIndex: number;
  crowdingState: string;
  actionable: { asset: AssetSymbol; strategy: string; direction: string }[];
  noTradeCount: number;
  alerts: AgentAlert[];
}

export function buildTick(decisions: DecisionPacket[], crowding: CrowdingIndex): AgentTick {
  const alerts: AgentAlert[] = [];

  if (crowding.index >= 70) {
    alerts.push({ level: "warn", text: `Agent Crowding Index elevated at ${crowding.index}/100 — trimming risk.` });
  }

  for (const p of decisions) {
    if (p.scores.crowdScore >= 80) {
      alerts.push({ level: "signal", text: `${p.asset}: extreme crowding (CrowdScore ${p.scores.crowdScore}) — overreaction risk.`, asset: p.asset });
    }
    if (Math.abs(p.scores.fairValueGapPct) >= 2) {
      alerts.push({ level: "signal", text: `${p.asset}: mispriced ${pct(p.scores.fairValueGapPct)} vs underlying.`, asset: p.asset });
    }
    if (p.finalAction !== "no_trade") {
      alerts.push({ level: "signal", text: `${p.asset}: ${p.selectedStrategy} ${p.direction.toUpperCase()} (conf ${(p.scores.strategyConfidence * 100).toFixed(0)}%).`, asset: p.asset });
    } else if (p.selectedStrategy !== "No-Trade / Risk-Off" && p.risk.blocks.length > 0) {
      alerts.push({ level: "warn", text: `${p.asset}: ${p.selectedStrategy} blocked by risk governor — ${p.risk.blocks[0]}`, asset: p.asset });
    }
  }

  const actionable = decisions
    .filter((p) => p.finalAction !== "no_trade")
    .map((p) => ({ asset: p.asset, strategy: p.selectedStrategy, direction: p.direction }));

  if (actionable.length === 0) {
    alerts.push({ level: "info", text: "No qualifying edge — standing aside (disciplined No-Trade)." });
  }

  return {
    posture: crowding.recommendation,
    crowdingIndex: crowding.index,
    crowdingState: crowding.state,
    actionable,
    noTradeCount: decisions.filter((p) => p.finalAction === "no_trade").length,
    alerts,
  };
}
