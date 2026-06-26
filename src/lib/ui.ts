import type { Direction, FinalAction, Regime, RiskState, Strategy } from "@/lib/types";

// Client-safe display helpers: colors + formatting. Type-only imports, so this
// pulls no server code into the bundle. Colors are tuned for the light theme:
// pos=green, neg=red, warn=amber, info=blue, event=gold, muted=neutral.

export function pctStr(x: number | null | undefined, dp = 2): string {
  if (x === null || x === undefined) return "—";
  const s = x >= 0 ? "+" : "";
  return `${s}${x.toFixed(dp)}%`;
}

const NEUTRAL_PILL = "text-muted2 border-line2 bg-[#F2F2EF]";

export function regimeColor(r: Regime): string {
  switch (r) {
    case "Clean Trend":
      return "text-pos-ink border-pos/25 bg-pos/10";
    case "Crowded Hype":
      return "text-neg border-neg/25 bg-neg/10";
    case "Fair-Value Gap":
      return "text-info border-info/25 bg-info/10";
    case "Macro Shock":
      return "text-warn border-warn/25 bg-warn/10";
    case "Earnings Event":
      return "text-event border-event/25 bg-event/10";
    case "Noise":
      return NEUTRAL_PILL;
  }
}

/** The accent dot color for a regime (used in pills). */
export function regimeDot(r: Regime): string {
  switch (r) {
    case "Clean Trend":
      return "bg-pos";
    case "Crowded Hype":
      return "bg-neg";
    case "Fair-Value Gap":
      return "bg-info";
    case "Macro Shock":
      return "bg-warn";
    case "Earnings Event":
      return "bg-event";
    case "Noise":
      return "bg-muted";
  }
}

export function strategyShort(s: Strategy): string {
  return s === "No-Trade / Risk-Off" ? "No-Trade" : s;
}

export function strategyColor(s: Strategy): string {
  switch (s) {
    case "Momentum Follow":
      return "text-pos-ink";
    case "CounterFlow Fade":
      return "text-neg";
    case "Fair-Value Convergence":
      return "text-info";
    case "Volatility Breakout":
      return "text-warn";
    case "Earnings Drift":
      return "text-event";
    case "Macro Rebalance":
      return "text-warn";
    case "No-Trade / Risk-Off":
      return "text-muted2";
  }
}

export function actionLabel(a: FinalAction): string {
  switch (a) {
    case "long_paper":
      return "LONG";
    case "short_paper":
      return "SHORT";
    case "no_trade":
      return "FLAT";
  }
}

export function actionColor(a: FinalAction): string {
  switch (a) {
    case "long_paper":
      return "text-pos-ink border-pos/25 bg-pos/10";
    case "short_paper":
      return "text-neg border-neg/25 bg-neg/10";
    case "no_trade":
      return NEUTRAL_PILL;
  }
}

export function directionColor(d: Direction): string {
  if (d === "long") return "text-pos-ink";
  if (d === "short") return "text-neg";
  return "text-muted2";
}

export function riskStateColor(s: RiskState): string {
  switch (s) {
    case "Normal":
      return "text-pos-ink border-pos/25 bg-pos/10";
    case "Caution":
      return "text-warn border-warn/25 bg-warn/10";
    case "Risk-Off":
      return "text-neg border-neg/25 bg-neg/10";
    case "Kill Switch":
      return "text-white border-neg bg-neg";
  }
}

export function crowdColor(score: number): string {
  if (score >= 80) return "text-neg";
  if (score >= 60) return "text-warn";
  if (score >= 30) return "text-ink2";
  return "text-pos-ink";
}

export function agentColor(agent: string): string {
  const map: Record<string, string> = {
    Macro: "text-warn",
    News: "text-event",
    "Fair-Value": "text-info",
    Crowd: "text-neg",
    Technical: "text-pos-ink",
    Liquidity: "text-info",
    Risk: "text-warn",
    "Strategy Router": "text-ink",
  };
  return map[agent] ?? "text-muted2";
}

export function stanceLabel(stance: string): string {
  return stance.charAt(0).toUpperCase() + stance.slice(1);
}
