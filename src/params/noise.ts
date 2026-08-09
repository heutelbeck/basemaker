import type { Rng } from './random.ts';
import { seededRng } from './random.ts';

/**
 * Seeded 2D value noise with fractal (fBm) and ridged variants, used for
 * terrain-like displacement. Deterministic per seed, no global state.
 */
export interface Noise2d {
  sample(x: number, y: number): number;
  fbm(x: number, y: number, octaves: number): number;
  ridged(x: number, y: number, octaves: number): number;
}

const LATTICE = 256;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Smooth displacement field: warping tiled geometry with the same field
 * keeps it tiled (small displacements are a diffeomorphism), so organic
 * wobble never introduces overlaps.
 */
export interface WarpField {
  displace(x: number, y: number): [number, number];
}

export function makeWarpField(seed: number, amplitude: number, featureScale: number): WarpField {
  const nx = makeNoise2d(seed * 31 + 7);
  const ny = makeNoise2d(seed * 47 + 13);
  return {
    displace(x: number, y: number): [number, number] {
      const u = x / featureScale;
      const v = y / featureScale;
      return [
        x + amplitude * (2 * nx.fbm(u, v, 3) - 1),
        y + amplitude * (2 * ny.fbm(u, v, 3) - 1),
      ];
    },
  };
}

export function makeNoise2d(seed: number): Noise2d {
  const rng: Rng = seededRng(seed);
  const values = new Float32Array(LATTICE * LATTICE);
  for (let i = 0; i < values.length; i++) {
    values[i] = rng();
  }
  const at = (ix: number, iy: number) =>
    values[((iy & (LATTICE - 1)) * LATTICE + (ix & (LATTICE - 1))) >>> 0];

  const sample = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const v00 = at(ix, iy);
    const v10 = at(ix + 1, iy);
    const v01 = at(ix, iy + 1);
    const v11 = at(ix + 1, iy + 1);
    return (
      v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
    );
  };

  const fbm = (x: number, y: number, octaves: number): number => {
    let amplitude = 0.5;
    let frequency = 1;
    let total = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      total += amplitude * sample(x * frequency + o * 31.7, y * frequency + o * 17.3);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2.05;
    }
    return total / norm;
  };

  const ridged = (x: number, y: number, octaves: number): number => {
    let amplitude = 0.5;
    let frequency = 1;
    let total = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const v = sample(x * frequency + o * 23.1, y * frequency + o * 41.9);
      total += amplitude * (1 - Math.abs(2 * v - 1));
      norm += amplitude;
      amplitude *= 0.55;
      frequency *= 2.1;
    }
    return total / norm;
  };

  return { sample, fbm, ridged };
}
