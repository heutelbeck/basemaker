import { describe, expect, it } from 'vitest';
import { computeEdgeProfile, profileInsetAt } from '../src/params/edgeProfile.ts';
import { GAME_LIBRARY } from '../src/generators/library.ts';

const OFFICIAL: Record<string, { nominal: number; points: [number, number][] }> = {
  'Small 30 mm': {
    nominal: 15,
    points: [
      [0.5, 14.928],
      [1.75, 14.636],
      [2.5, 14.279],
      [3.4, 13.487],
      [3.88, 12.884],
      [4.28, 12.232],
      [4.42, 11.919],
    ],
  },
  'Medium 40 mm': {
    nominal: 20,
    points: [
      [0.85, 19.916],
      [4.06, 17.64],
      [4.26, 17.261],
      [4.4, 16.943],
      [4.46, 16.691],
      [4.5, 16.432],
    ],
  },
  'Large 50 mm': {
    nominal: 25,
    points: [
      [2.5, 24.122],
      [4.02, 22.381],
      [4.32, 21.593],
      [4.42, 21.181],
      [4.46, 20.972],
      [4.5, 20.552],
    ],
  },
  'Huge 120 mm': {
    nominal: 60,
    points: [
      [4.06, 57.337],
      [4.3, 56.741],
      [4.4, 56.329],
      [4.44, 56.119],
      [4.5, 55.696],
    ],
  },
};

describe('warmachine profiles', () => {
  it.each(Object.entries(OFFICIAL))(
    'library preset %s stays within 0.3 mm of the measured official wall',
    (name, data) => {
      const entry = GAME_LIBRARY.find(
        (candidate) => candidate.system === 'Warmachine & Hordes' && candidate.name === name,
      );
      if (entry === undefined || entry.job.generator !== 'base') {
        throw new Error(`Missing library entry ${name}.`);
      }
      const params = entry.job.params;
      const profile = computeEdgeProfile(
        params.height,
        params.edgeSlope,
        params.lipRadius,
        0.02,
        params.lipTopRadius,
      );
      for (const [z, officialR] of data.points) {
        const ours = data.nominal - profileInsetAt(profile, Math.min(z, params.height));
        expect(Math.abs(ours - officialR)).toBeLessThan(0.3);
      }
    },
  );
});
