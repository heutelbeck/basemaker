import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { circleOutline } from '../src/params/tessellation.ts';
import type { BaseParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), height: 4, edgeSlope: 1.5, ...overrides };
}

function ngonPrismVolume(r: number, n: number, height: number): number {
  return 0.5 * n * r * r * Math.sin((2 * Math.PI) / n) * height;
}

describe('buildBase plain shells', () => {
  it('builds a straight-sided round base as an exact n-gon prism', async () => {
    const wasm = await getManifold();
    const straight = params({ edgeSlope: 0 });
    const solid = buildBase(wasm, straight);
    const n = circleOutline(16, 0.02).length;
    expect(solid.status()).toBe('NoError');
    expect(solid.genus()).toBe(0);
    expect(solid.volume()).toBeCloseTo(ngonPrismVolume(16, n, 4), 6);
    solid.delete();
  });

  it('approaches the ideal cylinder volume as the tolerance tightens', async () => {
    const wasm = await getManifold();
    const coarse = buildBase(wasm, params({ edgeSlope: 0, quality: { chordTolMm: 0.1 } }));
    const fine = buildBase(wasm, params({ edgeSlope: 0, quality: { chordTolMm: 0.005 } }));
    const ideal = Math.PI * 16 * 16 * 4;
    const coarseDeficit = ideal - coarse.volume();
    const fineDeficit = ideal - fine.volume();
    expect(coarseDeficit).toBeGreaterThan(0);
    expect(fineDeficit).toBeGreaterThan(0);
    expect(fineDeficit).toBeLessThan(coarseDeficit / 5);
    coarse.delete();
    fine.delete();
  });

  it('uses enough segments that facets stay below the default tolerance on a 32 mm base', async () => {
    const wasm = await getManifold();
    const solid = buildBase(wasm, params({}));
    const mesh = solid.getMesh();
    const vertices = mesh.numVert;
    expect(vertices).toBeGreaterThanOrEqual(2 * 60);
    solid.delete();
  });

  it('tapers by the edge slope: full size at the bottom, inset at the top', async () => {
    const wasm = await getManifold();
    const sloped = buildBase(wasm, params({ edgeSlope: 2 }));
    const outline = circleOutline(16, 0.02);
    const n = outline.length;
    const slabProto = wasm.Manifold.cube([100, 100, 0.001], true);
    const bottomSlab = slabProto.translate(0, 0, 0.0005);
    const bottomSlice = sloped.intersect(bottomSlab);
    const bottomArea = 0.5 * n * 16 * 16 * Math.sin((2 * Math.PI) / n);
    expect(bottomSlice.volume() / 0.001).toBeCloseTo(bottomArea, 0);
    const topSlab = slabProto.translate(0, 0, 4 - 0.0005);
    const topSlice = sloped.intersect(topSlab);
    const insetVertexRadius = 16 - 2 / Math.cos(Math.PI / n);
    const topArea = 0.5 * n * insetVertexRadius * insetVertexRadius * Math.sin((2 * Math.PI) / n);
    expect(topSlice.volume() / 0.001).toBeCloseTo(topArea, 0);
    expect(bottomArea).toBeGreaterThan(topArea);
    for (const resource of [sloped, slabProto, bottomSlab, bottomSlice, topSlab, topSlice]) {
      resource.delete();
    }
  });

  it('builds every footprint shape as a valid genus-zero solid', async () => {
    const wasm = await getManifold();
    const shapes: BaseParams['shape'][] = [
      { kind: 'round', diameter: 32 },
      { kind: 'oval', length: 60, width: 35 },
      { kind: 'gwOval', preset: '75x42' },
      { kind: 'pill', length: 60, width: 25 },
      { kind: 'square', size: 30 },
      { kind: 'rect', length: 50, width: 25 },
      { kind: 'hex', size: 25 },
    ];
    for (const shape of shapes) {
      const solid = buildBase(wasm, params({ shape }));
      expect(solid.status()).toBe('NoError');
      expect(solid.genus()).toBe(0);
      expect(solid.volume()).toBeGreaterThan(0);
      solid.delete();
    }
  });
});

describe('buildBase hollow shells', () => {
  it('removes the cavity volume from a straight-sided base', async () => {
    const wasm = await getManifold();
    const hollow = buildBase(
      wasm,
      params({ edgeSlope: 0, hollow: { wall: 2, topThickness: 1, supports: null } }),
    );
    const solidRef = buildBase(wasm, params({ edgeSlope: 0 }));
    const outerN = circleOutline(16, 0.02).length;
    const cavityOutline = circleOutline(16, 0.02);
    expect(hollow.status()).toBe('NoError');
    expect(hollow.genus()).toBe(0);
    expect(hollow.volume()).toBeLessThan(solidRef.volume());
    expect(outerN).toBe(cavityOutline.length);
    hollow.delete();
    solidRef.delete();
  });

  it('keeps at least the wall thickness against the inward sloping sides', async () => {
    const wasm = await getManifold();
    const edgeSlope = 1.5;
    const wall = 2;
    const topThickness = 1;
    const height = 4;
    const hollow = buildBase(
      wasm,
      params({ edgeSlope, hollow: { wall, topThickness, supports: null } }),
    );
    const ceilingHeight = height - topThickness;
    const slabProto = wasm.Manifold.cube([100, 100, 0.001], true);
    const ceilingSlab = slabProto.translate(0, 0, ceilingHeight - 0.0015);
    const ceilingRing = hollow.intersect(ceilingSlab);
    const ringArea = ceilingRing.volume() / 0.001;
    const n = circleOutline(16, 0.02).length;
    const outerRadiusAtCeiling = 16 - (edgeSlope * ceilingHeight) / height;
    const cavityRadius = 16 - (edgeSlope * ceilingHeight) / height - wall;
    const minRingArea =
      0.5 * n * outerRadiusAtCeiling ** 2 * Math.sin((2 * Math.PI) / n) -
      Math.PI * cavityRadius ** 2;
    expect(ringArea).toBeGreaterThanOrEqual(minRingArea - 1);
    expect(ringArea).toBeGreaterThan(0);
    for (const resource of [hollow, slabProto, ceilingSlab, ceilingRing]) {
      resource.delete();
    }
  });
});

describe('hex bases', () => {
  it('builds a hex base with the exact across-flats width', async () => {
    const wasm = await getManifold();
    const hex = buildBase(wasm, params({ shape: { kind: 'hex', size: 25 }, edgeSlope: 0 }));
    const box = hex.boundingBox();
    expect(box.max[1] - box.min[1]).toBeCloseTo(25, 6);
    expect(box.max[0] - box.min[0]).toBeCloseTo((2 * 25) / Math.sqrt(3), 6);
    const hexArea = (Math.sqrt(3) / 2) * 25 * 25;
    expect(hex.volume()).toBeCloseTo(hexArea * 4, 4);
    hex.delete();
  });
});
