import type { NextRequest } from "next/server";
import type { AssetSymbol } from "@/lib/types";
import { ASSET_SYMBOLS } from "@/lib/types";
import { getPriceHistory } from "@/lib/market/live";
import { generateBoard, simPriceHistory } from "@/lib/market/generator";

// Recent token-vs-underlying price history for the asset chart.
// ?asset=NVDAx&source=live|sim

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const asset = req.nextUrl.searchParams.get("asset") as AssetSymbol | null;
    if (!asset || !ASSET_SYMBOLS.includes(asset)) {
      return Response.json({ error: "Unknown asset" }, { status: 400 });
    }
    const wantLive = req.nextUrl.searchParams.get("source") === "live";

    if (wantLive) {
      try {
        const h = await getPriceHistory(asset);
        if (h.token.length > 1) return Response.json(h);
      } catch {
        // fall through to sim
      }
    }

    const board = generateBoard();
    const m = board.find((x) => x.meta.symbol === asset)!;
    const h = simPriceHistory(asset, m.snapshot.timestamp, m.snapshot.tokenPrice, m.snapshot.underlyingPrice);
    return Response.json({ ...h, source: "sim" });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
