import { readPortfolio } from "@/lib/portfolio/store";
import { snapshot } from "@/lib/portfolio/manager";
import { liveMarks } from "@/lib/portfolio/marks";

// Current live paper-portfolio, marked to market.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const p = await readPortfolio();
    const { marks, source } = await liveMarks();
    return Response.json({ ...snapshot(p, marks), source });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
