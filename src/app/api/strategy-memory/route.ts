import { readLedger } from "@/lib/ledger/store";
import { computeStrategyMemory } from "@/lib/memory";

// Strategy Performance Memory (PRD §17) derived from the on-disk ledger.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const entries = await readLedger();
    return Response.json(computeStrategyMemory(entries));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
