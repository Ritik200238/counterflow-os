import { scanBoard } from "@/lib/pipeline";
import { appendLedger, readLedger } from "@/lib/ledger/store";
import { computeLedgerStats } from "@/lib/memory";
import { rateLimited } from "@/lib/util/rateLimit";

// Run a live LLM-enriched scan, resolve the paper trades, and append every
// decision to the ledger. This is the "execute paper trades" action (PRD §8.1).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = rateLimited(req, 8);
  if (limited) return limited;
  try {
    const existing = await readLedger();
    const board = await scanBoard({ useLLM: true, source: "live", startSeq: existing.length + 1 });
    const entries = board.decisions.map((d) => d.ledgerEntry);
    await appendLedger(entries);
    const all = [...existing, ...entries];
    return Response.json({
      appended: entries.length,
      source: board.source,
      sourceNote: board.sourceNote,
      crowdingIndex: board.crowdingIndex,
      decisions: board.decisions.map((d) => d.packet),
      stats: computeLedgerStats(all),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
