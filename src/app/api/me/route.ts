import { clerkEnabled } from "@/lib/auth";

// Current user identity. Returns the signed-in Clerk user when auth is
// configured; otherwise reports that accounts are not enabled. Per-user features
// (saved portfolios, watchlists) build on this.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!clerkEnabled) {
    return Response.json({ configured: false, signedIn: false });
  }
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return Response.json({ configured: true, signedIn: Boolean(userId), userId: userId ?? null });
  } catch (err) {
    return Response.json({ configured: true, signedIn: false, error: (err as Error).message });
  }
}
