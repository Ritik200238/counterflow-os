import { readLedger } from "@/lib/ledger/store";
import { computeAutopilot } from "@/lib/autopilot";

// Strategy Autopilot allocation timeline (PRD §35) from the on-disk ledger.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const entries = await readLedger();
    return Response.json(computeAutopilot(entries));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
