import { runBacktest } from "@/lib/seed";
import { writeLedger } from "@/lib/ledger/store";
import { computeLedgerStats, computeStrategyMemory } from "@/lib/memory";
import { rateLimited } from "@/lib/util/rateLimit";

// Populate the ledger with a reproducible backtest (PRD §17 memory / §19 backtest).
// POST body: { decisions?: number, seed?: string }

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = rateLimited(req, 4);
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => ({}));
    const decisions = Number(body?.decisions) || 480;
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
