import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { signedArea } from '../src/geometry/outlines.ts';
import { circleOutline, segmentsFor } from '../src/params/tessellation.ts';
import type { BaseParams, MagnetParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), height: 4, edgeSlope: 1.5, ...overrides };
}

function roundMagnets(overrides: Partial<MagnetParams>): MagnetParams {
  return {
    shape: 'round',
    layout: 'line',
    diameter: 5,
    length: 5,
    width: 5,
    depth: 2,
    count: 1,
    spacing: 0,
    offsetX: 0,
    offsetY: 0,
    padding: 0.6,
    ...overrides,
  };
}

function ngonArea(r: number, n: number): number {
  return 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);
}

async function volumeOf(overrides: Partial<BaseParams>): Promise<number> {
  const wasm = await getManifold();
  const solid = buildBase(wasm, params(overrides));
  expect(solid.status()).toBe('NoError');
  const volume = solid.volume();
  solid.delete();
  return volume;
}

describe('magnet slots', () => {
  it('removes exactly one slot volume per magnet from a solid base', async () => {
    const base = await volumeOf({ edgeSlope: 0 });
    const single = await volumeOf({ edgeSlope: 0, magnets: roundMagnets({}) });
    const magnets = roundMagnets({});
    const n = segmentsFor(magnets.diameter / 2, 0.02);
    const slotVolume = ngonArea(magnets.diameter / 2, n) * magnets.depth;
    expect(base - single).toBeCloseTo(slotVolume, 2);
  });

  it('removes one slot per magnet for a row of magnets', async () => {
    const base = await volumeOf({ edgeSlope: 0 });
    const twin = await volumeOf({
      edgeSlope: 0,
      magnets: roundMagnets({ count: 2, spacing: 14 }),
    });
    const single = await volumeOf({ edgeSlope: 0, magnets: roundMagnets({}) });
    expect(base - twin).toBeCloseTo(2 * (base - single), 2);
  });

  it('cuts rectangular slots with the requested footprint', async () => {
    const base = await volumeOf({ edgeSlope: 0 });
    const rect = await volumeOf({
      edgeSlope: 0,
      magnets: roundMagnets({ shape: 'rect', length: 6, width: 4, depth: 1.5 }),
    });
    expect(base - rect).toBeCloseTo(6 * 4 * 1.5, 2);
  });

  it('keeps a hollow base printable: housings give each magnet slot walls', async () => {
    const wasm = await getManifold();
    const solid = buildBase(
      wasm,
      params({
        edgeSlope: 0,
        hollow: { wall: 2, topThickness: 1, supports: null },
        magnets: roundMagnets({}),
      }),
    );
    expect(solid.status()).toBe('NoError');
    const hollowNoMagnets = await volumeOf({
      edgeSlope: 0,
      hollow: { wall: 2, topThickness: 1, supports: null },
    });
    const magnets = roundMagnets({});
    const housingRadius = magnets.diameter / 2 + magnets.padding;
    const housingN = segmentsFor(housingRadius, 0.02);
    const slotN = segmentsFor(magnets.diameter / 2, 0.02);
    const cavityHeight = 4 - 1;
    const addedPillar = ngonArea(housingRadius, housingN) * cavityHeight;
    const removedSlot = ngonArea(magnets.diameter / 2, slotN) * magnets.depth;
    expect(solid.volume()).toBeCloseTo(hollowNoMagnets + addedPillar - removedSlot, 1);
    solid.delete();
  });
});

describe('recess', () => {
  it('removes the inset top area times the depth', async () => {
    const base = await volumeOf({ edgeSlope: 0 });
    const recessed = await volumeOf({ edgeSlope: 0, recess: { depth: 1.5, inset: 2 } });
    const outline = circleOutline(16, 0.02);
    const n = outline.length;
    const insetVertexRadius = 16 - 2 / Math.cos(Math.PI / n);
    const expected = ngonArea(insetVertexRadius, n) * 1.5;
    expect(base - recessed).toBeCloseTo(expected, 1);
  });
});

describe('slotta slot', () => {
  it('cuts a through slot of the requested size', async () => {
    const base = await volumeOf({ edgeSlope: 0 });
    const slotted = await volumeOf({
      edgeSlope: 0,
      slotta: { length: 20, width: 4, angleDeg: 0, offsetX: 0, offsetY: 0 },
    });
    expect(base - slotted).toBeCloseTo(20 * 4 * 4, 2);
  });

  it('cuts the same volume regardless of rotation', async () => {
    const straight = await volumeOf({
      edgeSlope: 0,
      slotta: { length: 20, width: 4, angleDeg: 0, offsetX: 0, offsetY: 0 },
    });
    const rotated = await volumeOf({
      edgeSlope: 0,
      slotta: { length: 20, width: 4, angleDeg: 37, offsetX: 0, offsetY: 0 },
    });
    expect(rotated).toBeCloseTo(straight, 2);
  });

  it('keeps a rim around the slot inside a hollow base', async () => {
    const hollowOnly = await volumeOf({
      edgeSlope: 0,
      hollow: { wall: 2, topThickness: 1, supports: null },
    });
    const withSlot = await volumeOf({
      edgeSlope: 0,
      hollow: { wall: 2, topThickness: 1, supports: null },
      slotta: { length: 20, width: 3, angleDeg: 0, offsetX: 0, offsetY: 0 },
    });
    const cavityHeight = 4 - 1;
    const housingAdd = (20 + 2 * 1.5) * (3 + 2 * 1.5) * cavityHeight;
    const slotCut = 20 * 3 * 4;
    expect(withSlot - hollowOnly).toBeCloseTo(housingAdd - slotCut, 1);
  });

  it('turns a hollow base into a genus-one solid', async () => {
    const wasm = await getManifold();
    const solid = buildBase(
      wasm,
      params({
        hollow: { wall: 2, topThickness: 1, supports: null },
        slotta: { length: 18, width: 4, angleDeg: 0, offsetX: 0, offsetY: 0 },
      }),
    );
    expect(solid.status()).toBe('NoError');
    expect(solid.genus()).toBe(1);
    solid.delete();
  });
});

describe('converter', () => {
  it('cuts an insert pocket grown by the clearance', async () => {
    const outer = { kind: 'round', diameter: 40 } as const;
    const base = await volumeOf({ shape: outer, height: 5, edgeSlope: 0 });
    const clearance = 0.2;
    const converted = await volumeOf({
      shape: {
        kind: 'converter',
        outer,
        insert: { kind: 'square', size: 25 },
        insertDepth: 3,
        clearance,
      },
      height: 5,
      edgeSlope: 0,
    });
    const side = 25 + 2 * clearance;
    const cornerDeficit = (4 - Math.PI) * clearance * clearance;
    const pocketArea = side * side - cornerDeficit;
    expect(base - converted).toBeCloseTo(pocketArea * 3, 0);
  });

  it('produces a valid solid for a round-to-round converter', async () => {
    const wasm = await getManifold();
    const solid = buildBase(
      wasm,
      params({
        shape: {
          kind: 'converter',
          outer: { kind: 'round', diameter: 32 },
          insert: { kind: 'round', diameter: 25 },
          insertDepth: 3,
          clearance: 0.15,
        },
        height: 5,
      }),
    );
    expect(solid.status()).toBe('NoError');
    expect(solid.genus()).toBe(0);
    solid.delete();
  });
});

describe('full feature combination', () => {
  it('builds a hollow, magnetized, recessed, slotted base as a valid solid', async () => {
    const wasm = await getManifold();
    const solid = buildBase(
      wasm,
      params({
        shape: { kind: 'round', diameter: 50 },
        height: 5,
        edgeSlope: 1.5,
        hollow: { wall: 2, topThickness: 1.5, supports: null },
        magnets: roundMagnets({ count: 2, spacing: 16 }),
        recess: { depth: 1, inset: 2 },
        slotta: { length: 25, width: 4, angleDeg: 90, offsetX: 0, offsetY: 0 },
      }),
    );
    expect(solid.status()).toBe('NoError');
    expect(solid.volume()).toBeGreaterThan(0);
    solid.delete();
  });

  it('keeps outlines counterclockwise so cutter areas are positive', () => {
    expect(signedArea(circleOutline(16, 0.02))).toBeGreaterThan(0);
  });
});
