import type { NextRequest } from "next/server";
import { readLedger } from "@/lib/ledger/store";
import { ledgerToCsv } from "@/lib/ledger/csv";
import { computeLedgerStats } from "@/lib/memory";

// Trade ledger with optional asset/strategy filters and CSV/JSON export
// (PRD §16.3).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const asset = sp.get("asset");
    const strategy = sp.get("strategy");
    const format = sp.get("format");

    let entries = await readLedger();
    if (asset) entries = entries.filter((e) => e.asset === asset);
    if (strategy) entries = entries.filter((e) => e.selectedStrategy === strategy);

    if (format === "csv") {
      return new Response(ledgerToCsv(entries), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="counterflow-ledger.csv"',
        },
      });
    }

    return Response.json({ entries, stats: computeLedgerStats(entries) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
