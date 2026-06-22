import type { NextRequest } from "next/server";
import { generateBoard } from "@/lib/market/generator";
import { computeSignals } from "@/lib/context";
import { computeCrowdingIndex } from "@/lib/crowding";

// Agent Crowding Index — market-wide read across the universe (PRD §34).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const seed = req.nextUrl.searchParams.get("seed") ?? undefined;
    const board = generateBoard(seed);
    const signals = board.map((m) => computeSignals(m.snapshot));
    return Response.json(computeCrowdingIndex(signals));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
