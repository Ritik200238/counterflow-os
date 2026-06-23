import { benchSignals, currentSignalValues } from "@/lib/signals";
import { generateBoard } from "@/lib/market/generator";

// Signal Zoo: benchmarked signal library with real information coefficients.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const bench = benchSignals();
    const snapshots = generateBoard().map((m) => m.snapshot);
    return Response.json({ bench, current: currentSignalValues(snapshots) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
