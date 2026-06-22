import { runBacktest } from "@/lib/seed";
import { writeLedger } from "@/lib/ledger/store";
import { computeLedgerStats, computeStrategyMemory } from "@/lib/memory";

// Populate the ledger with a reproducible backtest (PRD §17 memory / §19 backtest).
// POST body: { decisions?: number, seed?: string }

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const decisions = Number(body?.decisions) || 160;
    const seed = typeof body?.seed === "string" ? body.seed : "counterflow-backtest";

    const entries = await runBacktest({ decisions, seed });
    await writeLedger(entries);

    return Response.json({
      written: entries.length,
      stats: computeLedgerStats(entries),
      memory: computeStrategyMemory(entries),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
