// Seeded pseudo-random number generator.
// The whole point of CounterFlow OS is reproducibility: same seed -> same market ->
// same decisions -> same ledger. So nothing in the engine uses Math.random();
// everything flows through a seeded mulberry32 stream.

export type Rng = () => number; // returns float in [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a string — handy for seeding from a symbol/date. */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function rngInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rngRange(rng, min, max + 1));
}

/** Box–Muller normal sample. */
export function rngGauss(rng: Rng, mean = 0, sd = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * sd;
}

export function rngPick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function rngBool(rng: Rng, pTrue: number): boolean {
  return rng() < pTrue;
}
