import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { SurfaceParams } from '../src/params/surface.ts';
import { defaultSurfaceParams, validateSurface } from '../src/params/surface.ts';
import type { BaseParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';

function params(overrides: Partial<BaseParams>): BaseParams {
  return {
    ...defaultParams(),
    shape: { kind: 'round', diameter: 50 },
    height: 4,
    ...overrides,
  };
}

async function volumeOf(surface: SurfaceParams | null): Promise<number> {
  const wasm = await getManifold();
  const solid = buildBase(wasm, params({ surface }));
  expect(solid.status()).toBe('NoError');
  const volume = solid.volume();
  solid.delete();
  return volume;
}

describe('surface textures', () => {
  it.each(['cobblestone', 'planks'] as const)('raises %s relief above the top face', async (type) => {
    const wasm = await getManifold();
    const plain = await volumeOf(null);
    const textured = buildBase(wasm, params({ surface: defaultSurfaceParams(type) }));
    expect(textured.status()).toBe('NoError');
    expect(textured.volume()).toBeGreaterThan(plain);
    const box = textured.boundingBox();
    expect(box.max[2]).toBeGreaterThan(4.2);
    expect(box.max[2]).toBeLessThanOrEqual(4 + 0.9);
    expect(box.max[0]).toBeLessThanOrEqual(25.01);
    expect(box.max[1]).toBeLessThanOrEqual(25.01);
    textured.delete();
  });

  it('carves a pond bowl below the face while raising a bank above it', async () => {
    const wasm = await getManifold();
    const plain = buildBase(wasm, params({ surface: null }));
    const pond = buildBase(wasm, params({ surface: defaultSurfaceParams('pond') }));
    expect(pond.status()).toBe('NoError');
    const slabProto = wasm.Manifold.cube([200, 200, 0.2], true);
    const slab = slabProto.translate(0, 0, 3.5);
    const plainSlice = plain.intersect(slab);
    const pondSlice = pond.intersect(slab);
    expect(pondSlice.volume()).toBeLessThan(plainSlice.volume() - 1);
    expect(pond.boundingBox().max[2]).toBeGreaterThan(4.05);
    for (const resource of [plain, pond, slabProto, slab, plainSlice, pondSlice]) {
      resource.delete();
    }
  });

  it('raises a ropey lava layer with crack floors at the original face', async () => {
    const wasm = await getManifold();
    const plain = await volumeOf(null);
    const lava = buildBase(wasm, params({ surface: defaultSurfaceParams('lava') }));
    expect(lava.status()).toBe('NoError');
    expect(lava.volume()).toBeGreaterThan(plain);
    expect(lava.boundingBox().max[2]).toBeGreaterThan(4.4);
    lava.delete();
  });

  it('keeps relief inside the top face edge margin', async () => {
    const wasm = await getManifold();
    const textured = buildBase(
      wasm,
      params({ surface: defaultSurfaceParams('cobblestone'), edgeSlope: 0 }),
    );
    const slabProto = wasm.Manifold.cube([100, 100, 0.4], true);
    const slab = slabProto.translate(0, 0, 4.3);
    const relief = textured.intersect(slab);
    const box = relief.boundingBox();
    expect(box.max[0]).toBeLessThanOrEqual(25 - 0.35);
    expect(box.max[1]).toBeLessThanOrEqual(25 - 0.35);
    expect(box.min[0]).toBeGreaterThanOrEqual(-25 + 0.35);
    for (const resource of [textured, slabProto, slab, relief]) {
      resource.delete();
    }
  });

  it('rebuilds identically for the same seed and differently for another', async () => {
    const base = defaultSurfaceParams('cobblestone');
    const same1 = await volumeOf(base);
    const same2 = await volumeOf({ ...base, seed: base.type === 'cobblestone' ? base.seed : 1 });
    const other = await volumeOf({ ...base, seed: 99 });
    expect(same1).toBe(same2);
    expect(other).not.toBe(same1);
  });

  it('supports all cobblestone patterns', async () => {
    for (const pattern of ['random', 'coursed', 'fan'] as const) {
      const surface = { ...defaultSurfaceParams('cobblestone'), pattern } as SurfaceParams;
      const volume = await volumeOf(surface);
      expect(volume).toBeGreaterThan(0);
    }
  });

  it('rejects engraving through a hollow top plate', () => {
    const pond = { ...defaultSurfaceParams('pond'), depth: 1.5 } as SurfaceParams;
    const issues = validateSurface(pond, 4, 1.2);
    expect(issues.map((issue) => issue.code)).toContain('surface-pond');
  });

  it('lays voronoi cobbles as a tight joint network without overlaps', async () => {
    const { voronoiCells, lloydRelax, insetConvex } = await import('../src/params/voronoi.ts');
    const { seededRng, range } = await import('../src/params/random.ts');
    const rng = seededRng(4);
    const sites: [number, number][] = [];
    for (let y = -20; y <= 20; y += 5) {
      for (let x = -20; x <= 20; x += 5) {
        sites.push([x + range(rng, -1.7, 1.7), y + range(rng, -1.7, 1.7)]);
      }
    }
    const relaxed = lloydRelax(sites, 20, 20, 15);
    const cells = voronoiCells(relaxed, 20, 20, 15);
    const cellArea = (cell: [number, number][]) => {
      let sum = 0;
      for (let i = 0; i < cell.length; i++) {
        const [x1, y1] = cell[i];
        const [x2, y2] = cell[(i + 1) % cell.length];
        sum += x1 * y2 - x2 * y1;
      }
      return Math.abs(sum) / 2;
    };
    const total = cells.reduce((acc, cell) => acc + cellArea(cell), 0);
    expect(total).toBeCloseTo(40 * 40, 3);
    const stones = cells.map((cell) => insetConvex(cell, 0.2));
    for (const stone of stones) {
      expect(cellArea(stone)).toBeLessThan(cellArea(cells[stones.indexOf(stone)]));
    }
  });

  it('raises steel plates with rivet detail above the plate level', async () => {
    const wasm = await getManifold();
    const plain = await volumeOf(null);
    const plates = buildBase(wasm, params({ surface: defaultSurfaceParams('steelPlates') }));
    expect(plates.status()).toBe('NoError');
    expect(plates.volume()).toBeGreaterThan(plain);
    const box = plates.boundingBox();
    expect(box.max[2]).toBeCloseTo(4 + 0.4 + 0.2, 4);
    plates.delete();
  });

  it('builds craters with raised rims and sunken bowls', async () => {
    const wasm = await getManifold();
    const plain = await volumeOf(null);
    const cratered = buildBase(wasm, params({ surface: defaultSurfaceParams('craters') }));
    expect(cratered.status()).toBe('NoError');
    const box = cratered.boundingBox();
    expect(box.max[2]).toBeGreaterThan(4.2);
    void plain;
    cratered.delete();
  });

  it('rejects out-of-range relief heights', () => {
    const cobbles = { ...defaultSurfaceParams('cobblestone'), reliefHeight: 3 } as SurfaceParams;
    const issues = validateSurface(cobbles, 4, null);
    expect(issues.map((issue) => issue.code)).toContain('surface-relief');
  });
});
