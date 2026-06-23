import type { NextRequest } from "next/server";
import { scanBoard } from "@/lib/pipeline";
import { buildTick } from "@/lib/agent/activity";
import { appendLedger, readLedger } from "@/lib/ledger/store";

// One autonomous agent cycle: scan the (live) market, derive the tick summary +
// proactive alerts. ?log=1 appends actionable decisions to the ledger (used by
// the Vercel cron for true server-side autonomy). ?source=sim forces the demo.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const source = sp.get("source") === "sim" ? "sim" : "live";
    const log = sp.get("log") === "1";

    const existing = log ? await readLedger() : [];
    const board = await scanBoard({ source, useLLM: false, startSeq: existing.length + 1 });
    const decisions = board.decisions.map((d) => d.packet);
    const tick = buildTick(decisions, board.crowdingIndex);

    let logged = 0;
    if (log) {
      const actionable = board.decisions.filter((d) => d.packet.finalAction !== "no_trade");
      if (actionable.length > 0) {
        await appendLedger(actionable.map((d) => d.ledgerEntry));
        logged = actionable.length;
      }
    }

    return Response.json({
      tick,
      decisions: decisions.map((p) => ({
        asset: p.asset,
        regime: p.marketRegime,
        strategy: p.selectedStrategy,
        action: p.finalAction,
        direction: p.direction,
        crowdScore: p.scores.crowdScore,
        fairValueGapPct: p.scores.fairValueGapPct,
        strategyConfidence: p.scores.strategyConfidence,
        tokenPrice: p.market.tokenPrice,
        underlyingPrice: p.market.underlyingPrice,
      })),
      source: board.source,
      sourceNote: board.sourceNote,
      timestamp: board.timestamp,
      logged,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
