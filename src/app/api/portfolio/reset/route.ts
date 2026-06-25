import { writePortfolio } from "@/lib/portfolio/store";
import { emptyPortfolio } from "@/lib/portfolio/types";
import { snapshot } from "@/lib/portfolio/manager";
import { liveMarks } from "@/lib/portfolio/marks";

// Reset the live paper portfolio back to starting capital.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const p = emptyPortfolio(new Date().toISOString());
    await writePortfolio(p);
    const { marks } = await liveMarks();
    return Response.json(snapshot(p, marks));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
