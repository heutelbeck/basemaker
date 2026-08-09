/**
 * Deterministic pseudo random numbers for procedural geometry. Every
 * generator takes an explicit seed so identical parameters always rebuild
 * identical solids; Math.random must never appear in geometry code.
 */
export type Rng = () => number;

/** Mulberry32: small, fast, and good enough for jitter and placement. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform value in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
