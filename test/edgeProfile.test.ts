import { describe, expect, it } from 'vitest';
import { computeEdgeProfile, profileInsetAt, topInsetFor } from '../src/params/edgeProfile.ts';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { BaseParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), height: 4, edgeSlope: 1.5, ...overrides };
}

describe('edge profile math', () => {
  it('reduces to the straight taper when the lip radius is zero', () => {
    expect(topInsetFor(4, 1.5, 0)).toBe(1.5);
    const profile = computeEdgeProfile(4, 1.5, 0, 0.02);
    expect(profile.samples).toEqual([
      { inset: 0, z: 0 },
      { inset: 1.5, z: 4 },
    ]);
    expect(profileInsetAt(profile, 2)).toBeCloseTo(0.75, 9);
  });

  it('rounds a straight wall over by exactly the lip radius', () => {
    expect(topInsetFor(4, 0, 1)).toBeCloseTo(1, 9);
    const profile = computeEdgeProfile(4, 0, 1, 0.005);
    expect(profileInsetAt(profile, 4)).toBeCloseTo(1, 9);
    expect(profileInsetAt(profile, 3)).toBeCloseTo(0, 9);
    expect(profileInsetAt(profile, 3.5)).toBeCloseTo(1 - Math.sqrt(1 - 0.25), 9);
  });

  it('blends the lip tangentially into a sloped wall', () => {
    const height = 4;
    const slope = 1.5;
    const lip = 1;
    const topInset = topInsetFor(height, slope, lip);
    expect(topInset).toBeGreaterThan(slope);
    const profile = computeEdgeProfile(height, slope, lip, 0.005);
    const tangentZ = height - lip + (lip * slope) / Math.hypot(height, slope);
    const beforeTangent = profileInsetAt(profile, tangentZ - 0.01);
    const straightInset = (slope * (tangentZ - 0.01)) / height;
    expect(beforeTangent).toBeCloseTo(straightInset, 9);
    const insetAbove = profileInsetAt(profile, tangentZ + 0.01);
    const straightAbove = (slope * (tangentZ + 0.01)) / height;
    expect(insetAbove).toBeGreaterThan(straightAbove - 1e-9);
  });

  it('is monotone in z so the wall never widens going up', () => {
    const profile = computeEdgeProfile(4, 1.5, 1.2, 0.02);
    let previous = -1;
    for (let z = 0; z <= 4; z += 0.05) {
      const inset = profileInsetAt(profile, z);
      expect(inset).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = inset;
    }
  });
});

describe('rounded lip bases', () => {
  it('builds a valid solid with a smaller top face than the straight taper', async () => {
    const wasm = await getManifold();
    const flat = buildBase(wasm, params({}));
    const lipped = buildBase(wasm, params({ lipRadius: 1 }));
    expect(lipped.status()).toBe('NoError');
    expect(lipped.genus()).toBe(0);
    expect(lipped.volume()).toBeLessThan(flat.volume());
    flat.delete();
    lipped.delete();
  });

  it('keeps the bottom rim at the nominal size', async () => {
    const wasm = await getManifold();
    const lipped = buildBase(wasm, params({ lipRadius: 1.5, edgeSlope: 0 }));
    const box = lipped.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(32, 1);
    lipped.delete();
  });

  it('supports a hollow underside beneath the rounded lip', async () => {
    const wasm = await getManifold();
    const solid = buildBase(
      wasm,
      params({ lipRadius: 1, hollow: { wall: 2, topThickness: 1, supports: null } }),
    );
    expect(solid.status()).toBe('NoError');
    expect(solid.genus()).toBe(0);
    solid.delete();
  });
});
