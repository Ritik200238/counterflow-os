// Small numeric helpers used across the engine. Centralized so rounding/clamping
// behavior is consistent in every score, packet, and ledger row.

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

export function pct(x: number, dp = 2): string {
  const s = x >= 0 ? "+" : "";
  return `${s}${round(x, dp)}%`;
}

/** Linear map from [inLo,inHi] to [outLo,outHi], clamped. */
export function mapRange(
  x: number,
  inLo: number,
  inHi: number,
  outLo: number,
  outHi: number,
): number {
  if (inHi === inLo) return outLo;
  const t = clamp01((x - inLo) / (inHi - inLo));
  return outLo + t * (outHi - outLo);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
