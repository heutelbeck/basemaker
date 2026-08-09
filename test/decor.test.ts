import { describe, expect, it } from 'vitest';
import { buildCrystals, buildPlants, buildRock } from '../src/geometry/buildDecor.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { PlantParams } from '../src/params/decor.ts';
import {
  defaultCrystalParams,
  defaultPlantParams,
  defaultRockParams,
  validateCrystal,
  validatePlant,
  validateRock,
} from '../src/params/decor.ts';

describe('rock generator', () => {
  it('builds a valid faceted rock with a flat bottom and flat top spot', async () => {
    const wasm = await getManifold();
    const rock = buildRock(wasm, defaultRockParams());
    expect(rock.status()).toBe('NoError');
    expect(rock.genus()).toBe(0);
    const box = rock.boundingBox();
    expect(box.min[2]).toBeGreaterThanOrEqual(-0.01);
    const topSlabProto = wasm.Manifold.cube([60, 60, 0.3], true);
    const topSlab = topSlabProto.translate(0, 0, box.max[2] - 0.15);
    const flatSpot = rock.intersect(topSlab);
    const flatBox = flatSpot.boundingBox();
    expect(flatBox.max[0] - flatBox.min[0]).toBeGreaterThan(4);
    expect(flatBox.max[1] - flatBox.min[1]).toBeGreaterThan(4);
    for (const resource of [rock, topSlabProto, topSlab, flatSpot]) {
      resource.delete();
    }
  });

  it('is deterministic per seed and varies across seeds', async () => {
    const wasm = await getManifold();
    const a = buildRock(wasm, defaultRockParams());
    const b = buildRock(wasm, defaultRockParams());
    const c = buildRock(wasm, { ...defaultRockParams(), seed: 7 });
    expect(a.volume()).toBe(b.volume());
    expect(c.volume()).not.toBe(a.volume());
    a.delete();
    b.delete();
    c.delete();
  });

  it('rejects a flat spot larger than the rock', () => {
    const issues = validateRock({ ...defaultRockParams(), flatSpotDiameter: 19 });
    expect(issues.map((issue) => issue.code)).toContain('rock-params');
  });
});

describe('crystal generator', () => {
  it('builds a valid cluster grounded on its pad', async () => {
    const wasm = await getManifold();
    const cluster = buildCrystals(wasm, defaultCrystalParams());
    expect(cluster.status()).toBe('NoError');
    const box = cluster.boundingBox();
    expect(box.min[2]).toBeGreaterThanOrEqual(-0.01);
    expect(box.max[2]).toBeGreaterThan(8);
    cluster.delete();
  });

  it('rejects tilts beyond the printable cone', () => {
    const issues = validateCrystal({ ...defaultCrystalParams(), maxTiltDeg: 50 });
    expect(issues.map((issue) => issue.code)).toContain('crystal-params');
  });
});

describe('plant generator', () => {
  const varieties: PlantParams['variety'][] = ['grass', 'reeds', 'mushrooms'];

  it.each(varieties)('builds a valid support-free %s tuft', async (variety) => {
    const wasm = await getManifold();
    const tuft = buildPlants(wasm, { ...defaultPlantParams(), variety, seed: 3 });
    expect(tuft.status()).toBe('NoError');
    const box = tuft.boundingBox();
    expect(box.min[2]).toBeGreaterThanOrEqual(-0.01);
    expect(box.max[2]).toBeGreaterThan(3);
    tuft.delete();
  });

  it('keeps every stem inside the FDM lean cone', async () => {
    const wasm = await getManifold();
    const params = { ...defaultPlantParams(), count: 12, heightMm: 12, spreadMm: 4, seed: 5 };
    const tuft = buildPlants(wasm, params);
    const box = tuft.boundingBox();
    const maxLeanRad = (40 * Math.PI) / 180;
    const maxReach =
      params.spreadMm + 1.5 + params.heightMm * Math.sin(maxLeanRad) + 1;
    expect(Math.max(Math.abs(box.min[0]), box.max[0])).toBeLessThanOrEqual(maxReach);
    expect(Math.max(Math.abs(box.min[1]), box.max[1])).toBeLessThanOrEqual(maxReach);
    tuft.delete();
  });

  it('rejects fragile over-tall plants', () => {
    const issues = validatePlant({ ...defaultPlantParams(), heightMm: 30 });
    expect(issues.map((issue) => issue.code)).toContain('plant-params');
  });
});
