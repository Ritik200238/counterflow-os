import type { AssetSymbol } from "@/lib/types";
import { getLiveBoard } from "@/lib/market/live";
import { generateBoard } from "@/lib/market/generator";

// Current token prices to mark the portfolio to market. Live (Bitget) with a
// graceful fall back to the seeded board.
export async function liveMarks(): Promise<{ marks: Map<AssetSymbol, number>; source: "live" | "sim" }> {
  try {
    const board = await getLiveBoard(Date.now());
    return { marks: new Map(board.map((m) => [m.snapshot.symbol, m.snapshot.tokenPrice])), source: "live" };
  } catch {
    const board = generateBoard();
    return { marks: new Map(board.map((m) => [m.snapshot.symbol, m.snapshot.tokenPrice])), source: "sim" };
  }
}
