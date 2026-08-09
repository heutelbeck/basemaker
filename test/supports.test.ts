import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { segmentsFor } from '../src/geometry/tessellation.ts';
import { supportPillarCenters } from '../src/params/supports.ts';
import type { BaseParams, HollowParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';
import { validate } from '../src/params/validate.ts';

function hollow(overrides: Partial<HollowParams> = {}): HollowParams {
  return { wall: 2, topThickness: 1.2, supports: { spacing: 15, diameter: 3 }, ...overrides };
}

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), ...overrides };
}

describe('support pillar centers', () => {
  it('fills a 60 mm base with a symmetric 3x3 grid', () => {
    const centers = supportPillarCenters(
      params({ shape: { kind: 'round', diameter: 60 }, hollow: hollow() }),
    );
    expect(centers).toHaveLength(9);
    const sumX = centers.reduce((acc, [x]) => acc + x, 0);
    const sumY = centers.reduce((acc, [, y]) => acc + y, 0);
    expect(sumX).toBeCloseTo(0, 9);
    expect(sumY).toBeCloseTo(0, 9);
  });

  it('keeps a clearance gap to the hollow rim', () => {
    const diameter = 60;
    const centers = supportPillarCenters(
      params({ shape: { kind: 'round', diameter }, hollow: hollow() }),
    );
    const ceiling = 4 - 1.2;
    const wallInsetAtCeiling = (1.5 * ceiling) / 4;
    const cavityRadius = diameter / 2 - wallInsetAtCeiling - 2;
    for (const [x, y] of centers) {
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(cavityRadius - 1.5 - 1 + 1e-9);
    }
  });

  it('drops to a single center pillar when the base is too small for more', () => {
    const centers = supportPillarCenters(
      params({ shape: { kind: 'round', diameter: 40 }, hollow: hollow() }),
    );
    expect(centers).toEqual([[0, 0]]);
  });

  it('skips positions occupied by magnet holders', () => {
    const centers = supportPillarCenters(
      params({
        shape: { kind: 'round', diameter: 60 },
        hollow: hollow(),
        magnets: {
          shape: 'round',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 2,
          count: 1,
          spacing: 0,
          offsetX: 0,
          offsetY: 0,
          padding: 0.8,
        },
      }),
    );
    expect(centers).toHaveLength(8);
    expect(centers.some(([x, y]) => x === 0 && y === 0)).toBe(false);
  });

  it('skips positions under the slotta housing', () => {
    const centers = supportPillarCenters(
      params({
        shape: { kind: 'round', diameter: 60 },
        hollow: hollow(),
        slotta: { length: 25, width: 4, angleDeg: 0, offsetX: 0, offsetY: 0 },
      }),
    );
    expect(centers.some(([x, y]) => x === 0 && y === 0)).toBe(false);
    expect(centers.some(([x, y]) => x === 15 && y === 0)).toBe(false);
    expect(centers.some(([x, y]) => x === 15 && y === 15)).toBe(true);
  });

  it('returns nothing when supports are disabled', () => {
    expect(
      supportPillarCenters(
        params({ shape: { kind: 'round', diameter: 60 }, hollow: hollow({ supports: null }) }),
      ),
    ).toEqual([]);
  });
});

describe('support pillar geometry', () => {
  it('adds exactly the pillar volume inside the cavity', async () => {
    const wasm = await getManifold();
    const shape = { kind: 'round', diameter: 60 } as const;
    const plain = buildBase(wasm, params({ shape, hollow: hollow({ supports: null }) }));
    const supported = buildBase(wasm, params({ shape, hollow: hollow() }));
    expect(supported.status()).toBe('NoError');
    const n = segmentsFor(1.5, 0.02);
    const pillarArea = 0.5 * n * 1.5 * 1.5 * Math.sin((2 * Math.PI) / n);
    const cavityHeight = 4 - 1.2;
    expect(supported.volume() - plain.volume()).toBeCloseTo(9 * pillarArea * cavityHeight, 1);
    plain.delete();
    supported.delete();
  });

  it('rejects unprintable pillar settings', () => {
    const issues = validate(
      params({
        shape: { kind: 'round', diameter: 60 },
        hollow: hollow({ supports: { spacing: 4, diameter: 1 } }),
      }),
    );
    expect(issues.map((issue) => issue.code)).toContain('hollow-supports');
  });

  it('accepts the default support grid on a large base', () => {
    expect(validate(params({ shape: { kind: 'round', diameter: 100 }, hollow: hollow() }))).toEqual(
      [],
    );
  });
});
