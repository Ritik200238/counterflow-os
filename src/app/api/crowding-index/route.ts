import type { NextRequest } from "next/server";
import type { AssetMarketData } from "@/lib/types";
import { generateBoard } from "@/lib/market/generator";
import { getLiveBoard } from "@/lib/market/live";
import { computeSignals } from "@/lib/context";
import { computeCrowdingIndex } from "@/lib/crowding";

// Agent Crowding Index — market-wide read across the universe (PRD §34).
// ?source=live uses real Bitget + Yahoo data (falls back to the seeded board).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const seed = req.nextUrl.searchParams.get("seed") ?? undefined;
    const wantLive = req.nextUrl.searchParams.get("source") === "live";

    let board: AssetMarketData[];
    let source: "live" | "sim" = wantLive ? "live" : "sim";
    if (wantLive) {
      try {
        board = await getLiveBoard(Date.now());
      } catch {
        board = generateBoard(seed);
        source = "sim";
      }
    } else {
      board = generateBoard(seed);
    }

    const signals = board.map((m) => computeSignals(m.snapshot));
    return Response.json({ ...computeCrowdingIndex(signals), source });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
