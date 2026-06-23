import type { NextRequest } from "next/server";
import { scanBoard } from "@/lib/pipeline";

// Live strategy board for all 5 assets + Agent Crowding Index. ?llm=1 enables
// Qwen-written debate narratives (falls back to deterministic automatically).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const useLLM = req.nextUrl.searchParams.get("llm") === "1";
  const seed = req.nextUrl.searchParams.get("seed") ?? undefined;
  const source = req.nextUrl.searchParams.get("source") === "live" ? "live" : "sim";
  try {
    const board = await scanBoard({ useLLM, seed, source });
    return Response.json(board);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
