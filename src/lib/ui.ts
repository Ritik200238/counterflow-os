import type { Direction, FinalAction, Regime, RiskState, Strategy } from "@/lib/types";

// Client-safe display helpers: colors + formatting. Type-only imports, so this
// pulls no server code into the bundle.

export function pctStr(x: number | null | undefined, dp = 2): string {
  if (x === null || x === undefined) return "—";
  const s = x >= 0 ? "+" : "";
  return `${s}${x.toFixed(dp)}%`;
}

export function regimeColor(r: Regime): string {
  switch (r) {
    case "Clean Trend":
      return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
    case "Crowded Hype":
      return "text-rose-300 border-rose-500/40 bg-rose-500/10";
    case "Fair-Value Gap":
      return "text-cyan-300 border-cyan-500/40 bg-cyan-500/10";
    case "Macro Shock":
      return "text-amber-300 border-amber-500/40 bg-amber-500/10";
    case "Earnings Event":
      return "text-violet-300 border-violet-500/40 bg-violet-500/10";
    case "Noise":
      return "text-slate-300 border-slate-500/40 bg-slate-500/10";
  }
}

export function strategyShort(s: Strategy): string {
  return s === "No-Trade / Risk-Off" ? "No-Trade" : s;
}

export function strategyColor(s: Strategy): string {
  switch (s) {
    case "Momentum Follow":
      return "text-emerald-300";
    case "CounterFlow Fade":
      return "text-rose-300";
    case "Fair-Value Convergence":
      return "text-cyan-300";
    case "No-Trade / Risk-Off":
      return "text-slate-400";
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
      return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
    case "short_paper":
      return "text-rose-300 border-rose-500/40 bg-rose-500/10";
    case "no_trade":
      return "text-slate-300 border-slate-500/40 bg-slate-500/10";
  }
}

export function directionColor(d: Direction): string {
  if (d === "long") return "text-emerald-300";
  if (d === "short") return "text-rose-300";
  return "text-slate-400";
}

export function riskStateColor(s: RiskState): string {
  switch (s) {
    case "Normal":
      return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
    case "Caution":
      return "text-amber-300 border-amber-500/40 bg-amber-500/10";
    case "Risk-Off":
      return "text-rose-300 border-rose-500/40 bg-rose-500/10";
    case "Kill Switch":
      return "text-rose-200 border-rose-500/60 bg-rose-500/20";
  }
}

export function crowdColor(score: number): string {
  if (score >= 80) return "text-rose-300";
  if (score >= 60) return "text-amber-300";
  if (score >= 30) return "text-slate-200";
  return "text-emerald-300";
}

export function agentColor(agent: string): string {
  const map: Record<string, string> = {
    Macro: "text-amber-300",
    News: "text-violet-300",
    "Fair-Value": "text-cyan-300",
    Crowd: "text-rose-300",
    Technical: "text-emerald-300",
    Liquidity: "text-sky-300",
    Risk: "text-orange-300",
    "Strategy Router": "text-white",
  };
  return map[agent] ?? "text-slate-300";
}

export function stanceLabel(stance: string): string {
  return stance.charAt(0).toUpperCase() + stance.slice(1);
}
