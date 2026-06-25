// Lightweight in-memory sliding-window rate limiter for the expensive POST
// routes (backtest seed, live scan, ask). Per serverless instance (best-effort)
// — enough to blunt casual abuse; a global limit would use Vercel KV / WAF.

const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit = 8,
  windowMs = 60_000,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfter: 0 };
}

export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || "anon";
}

export function rateLimited(req: Request, limit = 8): Response | null {
  const { ok, retryAfter } = rateLimit(clientKey(req), limit);
  if (ok) return null;
  return Response.json(
    { error: "Rate limit exceeded. Try again shortly." },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}
