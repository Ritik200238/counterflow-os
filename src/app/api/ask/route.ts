import { scanBoard } from "@/lib/pipeline";
import { answerQuestion } from "@/lib/agent/ask";

// "Ask CounterFlow" — natural-language agent endpoint. Grounds every answer in
// the live engine board. POST { question, source?, llm? }.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? "").trim().slice(0, 500);
    if (!question) {
      return Response.json({ error: "Empty question." }, { status: 400 });
    }
    const source = body?.source === "sim" ? "sim" : "live";
    const useLLM = body?.llm !== false; // default on (falls back if no key)

    const board = await scanBoard({ source, useLLM: false });
    const decisions = board.decisions.map((d) => d.packet);
    const result = await answerQuestion(
      question,
      decisions,
      board.crowdingIndex,
      board.source,
      useLLM,
    );

    const referenced = decisions
      .filter((p) => result.referencedAssets.includes(p.asset))
      .map((p) => ({
        asset: p.asset,
        regime: p.marketRegime,
        strategy: p.selectedStrategy,
        action: p.finalAction,
      }));

    return Response.json({
      ...result,
      referenced,
      boardSource: board.source,
      timestamp: board.timestamp,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
