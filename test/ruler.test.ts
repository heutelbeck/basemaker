import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildJobBundle } from '../src/generators/job.ts';
import { initFontFromBuffer } from '../src/geometry/lettering/font.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { defaultRulerParams, validateRuler } from '../src/params/ruler.ts';

const require = createRequire(import.meta.url);

beforeAll(() => {
  const buffer = readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'));
  initFontFromBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
});

describe('measuring rulers', () => {
  it('builds a stick whose measured span is exact and carries a colored inlay', async () => {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, {
      generator: 'ruler',
      params: defaultRulerParams(),
    });
    expect(bundle.parts.map((part) => part.name)).toEqual(['stick', 'accent']);
    expect(bundle.stats.sizeX).toBeCloseTo(6 * 25.4, 2);
    expect(bundle.stats.sizeY).toBeCloseTo(10, 1);
  });

  it('splits long sticks into dovetailed piece pairs', async () => {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, {
      generator: 'ruler',
      params: { ...defaultRulerParams(), splitEveryUnits: 3 },
    });
    expect(bundle.parts.map((part) => part.name)).toEqual([
      'stick-1',
      'accent-1',
      'stick-2',
      'accent-2',
    ]);
  });

  it('builds press-fit pin chains as separate links in rows with exact pill lengths', async () => {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, {
      generator: 'ruler',
      params: {
        ...defaultRulerParams(),
        variant: 'chain',
        connector: 'pin',
        thicknessMm: 4,
        units: 4,
      },
    });
    const names = bundle.parts.map((part) => part.name);
    expect(names).toContain('link-1');
    expect(names).toContain('link-4');
    expect(names).toContain('accent-4');
    const groups = new Set(bundle.parts.map((part) => part.group));
    expect(groups.size).toBe(4);
    expect(bundle.stats.sizeY).toBeCloseTo(3 * 15 + 10, 1);
    expect(bundle.stats.sizeZ).toBeCloseTo(4, 1);
  });

  it('builds two-pivot chains with separate strap parts', async () => {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, {
      generator: 'ruler',
      params: {
        ...defaultRulerParams(),
        variant: 'chain',
        connector: 'pin',
        thicknessMm: 4,
        pivotsPerJoint: 2,
        units: 3,
      },
    });
    const names = bundle.parts.map((part) => part.name);
    expect(names).toContain('strap-1');
    expect(names).toContain('strap-2');
    const groups = new Set(bundle.parts.map((part) => part.group));
    expect(groups.size).toBe(5);
  });

  it('builds magnet chains with vertical pivot pockets', async () => {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, {
      generator: 'ruler',
      params: {
        ...defaultRulerParams(),
        variant: 'chain',
        connector: 'magnet',
        thicknessMm: 4,
        magnetDiameterMm: 4,
        magnetHeightMm: 1,
        units: 4,
      },
    });
    const names = bundle.parts.map((part) => part.name);
    expect(names).toContain('link-4');
    expect(bundle.stats.sizeZ).toBeCloseTo(4, 1);
  });

  it('rejects invalid dimensions and piece limits', () => {
    expect(validateRuler({ ...defaultRulerParams(), unitLengthMm: 2 })).toHaveLength(1);
    expect(validateRuler({ ...defaultRulerParams(), splitEveryUnits: 2.5 })).toHaveLength(1);
    expect(validateRuler(defaultRulerParams())).toEqual([]);
  });
});

describe('area templates', () => {
  it('builds round and teardrop templates with an accent frame', async () => {
    const wasm = await getManifold();
    const { defaultTemplateParams } = await import('../src/params/template.ts');
    const round = await buildJobBundle(wasm, {
      generator: 'template',
      params: defaultTemplateParams(),
    });
    expect(round.parts.map((part) => part.name)).toEqual(['template', 'accent']);
    expect(round.stats.sizeX).toBeCloseTo(76.2, 1);
    const flame = await buildJobBundle(wasm, {
      generator: 'template',
      params: { ...defaultTemplateParams(), variant: 'teardrop' },
    });
    expect(flame.stats.sizeX).toBeCloseTo(203.2, 1);
    expect(flame.stats.sizeY).toBeCloseTo(76.2, 1);
  });
});
