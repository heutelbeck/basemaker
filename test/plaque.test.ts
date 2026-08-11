import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { BaseParams, PlaqueParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';
import { validate } from '../src/params/validate.ts';

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), height: 4, edgeSlope: 1.5, ...overrides };
}

function plaque(overrides: Partial<PlaqueParams> = {}): PlaqueParams {
  return {
    style: 'plate',
    widthMm: 16,
    heightMm: 2.6,
    angleDeg: -90,
    thicknessMm: 0.7,
    rivetHeightMm: 0.2,
    colorHex: '#9AA5B1',
    text: null,
    ...overrides,
  };
}

describe('side plaques', () => {
  it('adds a riveted plate proud of the side wall', async () => {
    const wasm = await getManifold();
    const bare = buildBase(wasm, params({}));
    const plated = buildBase(wasm, params({ plaque: plaque() }));
    expect(plated.status()).toBe('NoError');
    expect(plated.volume()).toBeGreaterThan(bare.volume());
    const bareBox = bare.boundingBox();
    const platedBox = plated.boundingBox();
    expect(platedBox.min[1]).toBeLessThan(bareBox.min[1] - 0.25);
    bare.delete();
    plated.delete();
  });

  it('builds a scroll with rolled edges distinct from the plate', async () => {
    const wasm = await getManifold();
    const plated = buildBase(wasm, params({ plaque: plaque() }));
    const scrolled = buildBase(wasm, params({ plaque: plaque({ style: 'scroll' }) }));
    expect(scrolled.status()).toBe('NoError');
    expect(scrolled.volume()).not.toBeCloseTo(plated.volume(), 3);
    plated.delete();
    scrolled.delete();
  });

  it('builds plaques on straight-edged and oval bases', async () => {
    const wasm = await getManifold();
    const square = buildBase(
      wasm,
      params({ shape: { kind: 'square', size: 30 }, plaque: plaque() }),
    );
    const oval = buildBase(
      wasm,
      params({
        shape: { kind: 'oval', length: 60, width: 35 },
        plaque: plaque({ style: 'scroll' }),
      }),
    );
    expect(square.status()).toBe('NoError');
    expect(oval.status()).toBe('NoError');
    square.delete();
    oval.delete();
  });

  it('never pokes above the base top even at the maximum plaque height', async () => {
    const wasm = await getManifold();
    for (const style of ['plate', 'scroll'] as const) {
      const solid = buildBase(
        wasm,
        params({
          height: 3.4,
          edgeSlope: 1.3,
          plaque: plaque({ style, heightMm: 2.8, thicknessMm: style === 'scroll' ? 0.4 : 0.7 }),
        }),
      );
      const box = solid.boundingBox();
      expect(box.max[2]).toBeLessThanOrEqual(3.4 + 1e-6);
      expect(box.min[2]).toBeGreaterThanOrEqual(-1e-6);
      solid.delete();
    }
  });

  it('adds an independently configured second plaque on the opposite side', async () => {
    const wasm = await getManifold();
    const single = buildBase(wasm, params({ plaque: plaque() }));
    const double = buildBase(
      wasm,
      params({
        plaque: plaque(),
        plaqueBack: plaque({ angleDeg: 90, widthMm: 12, heightMm: 2.2 }),
      }),
    );
    expect(double.status()).toBe('NoError');
    expect(double.volume()).toBeGreaterThan(single.volume());
    const singleBox = single.boundingBox();
    const doubleBox = double.boundingBox();
    expect(doubleBox.max[1]).toBeGreaterThan(singleBox.max[1] + 0.25);
    single.delete();
    double.delete();
  });

  it('rejects combining rim lettering with plaques and validates plaque text', () => {
    const combined = params({
      plaque: plaque(),
      lettering: {
        text: 'HERO',
        sizeMm: 1.2,
        depth: 0.6,
        margin: 2,
        angleDeg: -90,
        colorHex: '#e8833a',
        strokeBoostMm: 0,
        style: 'engraved',
        placement: 'side',
        font: 'sans',
      },
    });
    expect(validate(combined).map((issue) => issue.code)).toContain('plaque-exclusive');
    const text = {
      text: '7',
      sizeMm: 1.2,
      depth: 0.6,
      strokeBoostMm: 0,
      style: 'engraved' as const,
      font: 'sans',
      colorHex: '#e8833a',
    };
    expect(validate(params({ plaque: plaque({ text }) }))).toEqual([]);
    const tooLong = params({
      plaque: plaque({ text: { ...text, text: 'FARTOOLONGFORTHEPLAQUE' } }),
    });
    expect(validate(tooLong).map((issue) => issue.code)).toContain('plaque-text');
    const nonRound = params({
      shape: { kind: 'square', size: 30 },
      plaque: plaque({ text }),
    });
    expect(validate(nonRound).map((issue) => issue.code)).toContain('plaque-text');
  });

  it('limits straight-edged plaques to one flat side and rejects oversized plaques', () => {
    const wide = params({
      shape: { kind: 'square', size: 25 },
      plaque: plaque({ widthMm: 26 }),
    });
    expect(validate(wide).map((issue) => issue.code)).toContain('plaque-fit');
    const fits = params({
      shape: { kind: 'square', size: 25 },
      plaque: plaque({ widthMm: 20 }),
    });
    expect(validate(fits)).toEqual([]);
    const tall = params({ plaque: plaque({ heightMm: 3.8 }) });
    expect(validate(tall).map((issue) => issue.code)).toContain('plaque-fit');
  });
});
