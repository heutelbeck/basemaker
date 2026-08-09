import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { toRawMesh } from '../src/geometry/mesh.ts';
import { analyzeOverhangs, explodeParts } from '../src/geometry/overhang.ts';
import { defaultParams } from '../src/params/types.ts';

describe('overhang analysis', () => {
  it('reports no unsupported area for a plain tapered base', async () => {
    const wasm = await getManifold();
    const solid = buildBase(wasm, defaultParams());
    const analysis = analyzeOverhangs(toRawMesh(solid));
    expect(analysis.overhangAreaMm2).toBe(0);
    expect(analysis.overlay).toBeNull();
    solid.delete();
  });

  it('flags the flat cavity ceiling of a hollow base without supports', async () => {
    const wasm = await getManifold();
    const solid = buildBase(wasm, {
      ...defaultParams(),
      shape: { kind: 'round', diameter: 60 },
      hollow: { wall: 2, topThickness: 1.2, supports: null },
    });
    const analysis = analyzeOverhangs(toRawMesh(solid));
    const cavityRadius = 30 - (1.5 * 2.8) / 4 - 2;
    const ceilingArea = Math.PI * cavityRadius * cavityRadius;
    expect(analysis.overhangAreaMm2).toBeGreaterThan(ceilingArea * 0.9);
    expect(analysis.overlay).not.toBeNull();
    solid.delete();
  });

  it('does not flag the bed-supported bottom face', async () => {
    const wasm = await getManifold();
    const solid = buildBase(wasm, { ...defaultParams(), edgeSlope: 0 });
    const analysis = analyzeOverhangs(toRawMesh(solid));
    expect(analysis.overhangAreaMm2).toBe(0);
    solid.delete();
  });
});

describe('explode layout', () => {
  it('drops parts to the plate and separates them along x', async () => {
    const wasm = await getManifold();
    const a = buildBase(wasm, defaultParams());
    const b = buildBase(wasm, { ...defaultParams(), shape: { kind: 'round', diameter: 25 } });
    const parts = [{ mesh: toRawMesh(a) }, { mesh: toRawMesh(b) }];
    const exploded = explodeParts(parts);
    for (const mesh of exploded) {
      let minZ = Infinity;
      for (let v = 0; v < mesh.positions.length; v += 3) {
        minZ = Math.min(minZ, mesh.positions[v + 2]);
      }
      expect(minZ).toBeCloseTo(0, 6);
    }
    let maxXFirst = -Infinity;
    let minXSecond = Infinity;
    for (let v = 0; v < exploded[0].positions.length; v += 3) {
      maxXFirst = Math.max(maxXFirst, exploded[0].positions[v]);
    }
    for (let v = 0; v < exploded[1].positions.length; v += 3) {
      minXSecond = Math.min(minXSecond, exploded[1].positions[v]);
    }
    expect(minXSecond - maxXFirst).toBeCloseTo(5, 6);
    a.delete();
    b.delete();
  });
});
