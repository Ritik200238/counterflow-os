import type { AssetSymbol } from "@/lib/types";
import { scanBoard } from "@/lib/pipeline";
import { readPortfolio, writePortfolio } from "@/lib/portfolio/store";
import { currentEquity, openPosition, snapshot, tickPositions } from "@/lib/portfolio/manager";

// One live portfolio cycle: mark to market, close positions that hit
// stop/take/time, then open positions for fresh actionable decisions. This is
// the real open -> monitor -> close trading loop (paper). Driven by the agent
// cron or the Portfolio page.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function runTick() {
  try {
    const p = await readPortfolio();
    const board = await scanBoard({ source: "live", useLLM: false });
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const marks = new Map<AssetSymbol, number>(
      board.decisions.map((d) => [d.packet.asset, d.packet.market.tokenPrice]),
    );

    // 1) Close positions that hit their exit.
    const { closed } = tickPositions(p, marks, nowIso);

    // 2) Open positions for new actionable setups (sized against current equity).
    const equity = currentEquity(p, marks);
    let opened = 0;
    for (const d of board.decisions) {
      if (openPosition(p, d.packet, equity, nowMs)) opened++;
    }

    await writePortfolio(p);
    return Response.json({
      ...snapshot(p, marks),
      source: board.source,
      closedThisTick: closed.length,
      openedThisTick: opened,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST for the UI; GET so the Vercel cron (which issues GET) can drive it headless.
export async function POST() {
  return runTick();
}
export async function GET() {
  return runTick();
}
