import { readLedger } from "@/lib/ledger/store";
import { computeBaselines, computeDiagnostics, type BaselineResult } from "@/lib/shadow";
import { round } from "@/lib/util/num";

// Decision Shadow: behavioral diagnostics on the agent's ledger + naive-baseline
// counterfactuals on the same market.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const entries = await readLedger();
    const diagnostics = computeDiagnostics(entries);
    const baselines = computeBaselines();

    const closed = entries.filter((e) => e.status === "closed" && e.pnlPct !== null);
    const returns = closed.map((e) => e.pnlPct as number);
    const wins = returns.filter((r) => r > 0).length;
    const counterflow: BaselineResult = {
      name: "CounterFlow OS (routed)",
      description: "Regime-routed: trades only when a strategy has edge",
      trades: returns.length,
      winRate: returns.length ? round(wins / returns.length, 3) : null,
      avgReturnPct: returns.length ? round(returns.reduce((a, b) => a + b, 0) / returns.length, 3) : null,
      totalPnlPct: round(returns.reduce((a, b) => a + b, 0), 2),
    };

    return Response.json({ diagnostics, counterflow, baselines });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
