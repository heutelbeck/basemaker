import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { defaultMountingHole, gwHexPegHole, gwTwinPegHoles } from '../src/params/mountingHoles.ts';
import type { BaseParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';
import { validate } from '../src/params/validate.ts';

function holedParams(overrides: Partial<BaseParams> = {}): BaseParams {
  return { ...defaultParams(), mountingHoles: gwHexPegHole(), ...overrides };
}

describe('validate mounting holes', () => {
  it('accepts the hex peg hole and the twin peg holes on default bases', () => {
    expect(validate(holedParams())).toEqual([]);
    expect(validate(holedParams({ mountingHoles: gwTwinPegHoles() }))).toEqual([]);
  });

  it('rejects a hole that does not fit inside the top face', () => {
    const params = holedParams();
    params.mountingHoles = { holes: [{ ...defaultMountingHole(), offsetX: 14 }] };
    const issues = validate(params);
    expect(issues.map((issue) => issue.code)).toContain('mounting-hole-fit');
  });

  it('rejects overlapping holes', () => {
    const params = holedParams();
    params.mountingHoles = {
      holes: [defaultMountingHole(), { ...defaultMountingHole(), offsetX: 3 }],
    };
    const issues = validate(params);
    expect(issues.map((issue) => issue.code)).toContain('mounting-hole-overlap');
  });

  it('rejects a hole that touches a magnet slot', () => {
    const params = holedParams({
      magnets: {
        shape: 'round',
        layout: 'line',
        diameter: 5,
        length: 5,
        width: 5,
        depth: 2,
        count: 1,
        spacing: 10,
        offsetX: 0,
        offsetY: 0,
        padding: 0.8,
      },
    });
    const issues = validate(params);
    expect(issues.map((issue) => issue.code)).toContain('mounting-hole-overlap');
  });

  it('rejects an invalid rim', () => {
    const params = holedParams();
    params.mountingHoles = { holes: [{ ...defaultMountingHole(), rimMm: 0.2 }] };
    const issues = validate(params);
    expect(issues.map((issue) => issue.code)).toContain('mounting-hole-values');
  });
});

describe('buildBase with mounting holes', () => {
  it('cuts one tunnel per hole through a solid base', async () => {
    const wasm = await getManifold();
    const solid = buildBase(wasm, holedParams({ mountingHoles: gwTwinPegHoles() }));
    expect(solid.status()).toBe('NoError');
    expect(solid.genus()).toBe(2);
    solid.delete();
  });

  it('keeps the structural tube around a hex hole in a hollow base', async () => {
    const wasm = await getManifold();
    const params = holedParams({
      shape: { kind: 'round', diameter: 40 },
      hollow: { wall: 1.1, topThickness: 1, supports: null },
    });
    const open = buildBase(wasm, { ...params, mountingHoles: null });
    const holed = buildBase(wasm, params);
    expect(holed.status()).toBe('NoError');
    expect(holed.volume()).toBeGreaterThan(open.volume());
    open.delete();
    holed.delete();
  });

  it('places the twin holes symmetrically on the X axis', async () => {
    const wasm = await getManifold();
    const params = holedParams({
      shape: { kind: 'round', diameter: 40 },
      mountingHoles: gwTwinPegHoles(),
    });
    const plain = buildBase(wasm, { ...params, mountingHoles: null });
    const holed = buildBase(wasm, params);
    const removed = plain.subtract(holed);
    const box = wasm.Manifold.cube([20, 40, 10], true);
    const left = box.translate(-10, 0, 0);
    const right = box.translate(10, 0, 0);
    const leftCut = removed.intersect(left);
    const rightCut = removed.intersect(right);
    expect(leftCut.volume()).toBeGreaterThan(1);
    expect(leftCut.volume()).toBeCloseTo(rightCut.volume(), 3);
    for (const solid of [plain, holed, removed, box, left, right, leftCut, rightCut]) {
      solid.delete();
    }
  });
});
