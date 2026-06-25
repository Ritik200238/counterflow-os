import type { NextRequest } from "next/server";
import type { AssetSymbol, FinalAction } from "@/lib/types";
import { generateBoard } from "@/lib/market/generator";
import { getLiveBoard } from "@/lib/market/live";
import { computeSignals } from "@/lib/context";
import { runCouncil } from "@/lib/council";
import { routeStrategy } from "@/lib/router";
import { riskGovernor } from "@/lib/governor";

// Server-Sent Events stream of the council deliberating one agent at a time,
// ending with the router verdict. Powers the live "watch the agents think" view.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const asset = (req.nextUrl.searchParams.get("asset") ?? "NVDAx") as AssetSymbol;
  const wantLive = req.nextUrl.searchParams.get("source") === "live";
  let source: "live" | "sim" = wantLive ? "live" : "sim";

  let board;
  try {
    board = wantLive ? await getLiveBoard(Date.now()) : generateBoard();
  } catch {
    board = generateBoard();
    source = "sim"; // live feed failed — fell back to demo
  }
  const md = board.find((m) => m.meta.symbol === asset);
  if (!md) {
    return Response.json({ error: `Unknown asset ${asset}` }, { status: 404 });
  }

  const sig = computeSignals(md.snapshot);
  const council = runCouncil(sig);
  const router = routeStrategy(sig, council);
  const risk = riskGovernor(sig, router);
  const finalAction: FinalAction =
    router.selectedStrategy === "No-Trade / Risk-Off" || !risk.approved
      ? "no_trade"
      : router.direction === "short"
        ? "short_paper"
        : "long_paper";

  const agents = [...council, router.routerAgent];
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ type: "meta", asset, source, regime: sig.regime.regime, regimeConfidence: sig.regime.confidence });
      for (const a of agents) {
        send({ type: "agent", agent: a });
        await sleep(450);
      }
      send({
        type: "verdict",
        selectedStrategy: router.selectedStrategy,
        direction: router.direction,
        finalAction,
        agreement: router.agreement,
        risk: { approved: risk.approved, state: risk.riskState, size: risk.positionSizePct },
      });
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
