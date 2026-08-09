import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { writeThreeMfParts } from '../src/export/threeMf.ts';
import { buildJobBundle } from '../src/generators/job.ts';
import { buildBase, buildLetterSolids } from '../src/geometry/buildBase.ts';
import { initFontFromBuffer } from '../src/geometry/lettering/font.ts';
import { textArcContours } from '../src/geometry/lettering/textOutlines.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { BaseParams, LetteringParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';
import { validate } from '../src/params/validate.ts';
import type { Font } from 'opentype.js';

const require = createRequire(import.meta.url);
let font: Font;

beforeAll(() => {
  const buffer = readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'));
  font = initFontFromBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
});

function lettering(overrides: Partial<LetteringParams> = {}): LetteringParams {
  return {
    text: 'HERO',
    sizeMm: 4,
    depth: 0.6,
    margin: 2,
    angleDeg: -90,
    colorHex: '#e8833a',
    style: 'engraved',
    placement: 'top',
    font: 'sans',
    ...overrides,
  };
}

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), height: 4, edgeSlope: 1.5, shape: { kind: 'round', diameter: 40 }, ...overrides };
}

describe('text contours', () => {
  it('produces contours near the rim baseline radius', () => {
    const contours = textArcContours(font, lettering(), 15);
    expect(contours.length).toBeGreaterThan(3);
    for (const contour of contours) {
      for (const [x, y] of contour.points) {
        const r = Math.hypot(x, y);
        expect(r).toBeGreaterThan(15 - 5);
        expect(r).toBeLessThan(15 + 2);
      }
    }
  });

  it('marks counters of closed glyphs as holes', () => {
    const contours = textArcContours(font, lettering({ text: 'O' }), 15);
    expect(contours.some((contour) => contour.isHole)).toBe(true);
    expect(contours.some((contour) => !contour.isHole)).toBe(true);
  });
});

describe('engraved bases', () => {
  it('removes exactly the letter volume from the body', async () => {
    const wasm = await getManifold();
    const plain = buildBase(wasm, params({}));
    const engraved = buildBase(wasm, params({ lettering: lettering() }), font);
    const letters = buildLetterSolids(wasm, params({ lettering: lettering() }), font);
    expect(engraved.status()).toBe('NoError');
    expect(letters.volume()).toBeGreaterThan(0);
    expect(plain.volume() - engraved.volume()).toBeCloseTo(letters.volume(), 1);
    plain.delete();
    engraved.delete();
    letters.delete();
  });

  it('keeps letter counters standing', async () => {
    const wasm = await getManifold();
    const engravedO = buildBase(wasm, params({ lettering: lettering({ text: 'O' }) }), font);
    const engravedI = buildBase(wasm, params({ lettering: lettering({ text: 'I' }) }), font);
    const lettersO = buildLetterSolids(wasm, params({ lettering: lettering({ text: 'O' }) }), font);
    const ringVolume = lettersO.volume();
    const boxO = lettersO.boundingBox();
    const outerWidth = boxO.max[0] - boxO.min[0];
    const fullDisc = Math.PI * (outerWidth / 2) ** 2 * 0.6;
    expect(ringVolume).toBeLessThan(fullDisc * 0.9);
    expect(engravedO.status()).toBe('NoError');
    expect(engravedI.status()).toBe('NoError');
    engravedO.delete();
    engravedI.delete();
    lettersO.delete();
  });

  it('exports body and lettering as separately colored 3MF objects', async () => {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, {
      generator: 'base',
      params: params({ lettering: lettering() }),
    });
    const parts = bundle.parts;
    expect(parts.map((part) => part.name)).toEqual(['body', 'lettering']);
    expect(bundle.stats.sizeX).toBeCloseTo(40, 1);
    const zipped = writeThreeMfParts(parts);
    const model = new TextDecoder().decode(unzipSync(zipped)['3D/3dmodel.model']);
    expect(model).toContain('displaycolor="#E8833AFF"');
    expect((model.match(/<object /g) ?? []).length).toBe(3);
    expect((model.match(/<component /g) ?? []).length).toBe(2);
    expect((model.match(/<item /g) ?? []).length).toBe(1);
  });
});

describe('lettering styles and placements', () => {
  it('embossed top letters add volume instead of removing it', async () => {
    const wasm = await getManifold();
    const plain = buildBase(wasm, params({}));
    const body = buildBase(wasm, params({ lettering: lettering({ style: 'embossed' }) }), font);
    const letters = buildLetterSolids(
      wasm,
      params({ lettering: lettering({ style: 'embossed' }) }),
      font,
    );
    expect(body.volume()).toBeCloseTo(plain.volume(), 4);
    expect(letters.volume()).toBeGreaterThan(0);
    const box = letters.boundingBox();
    expect(box.min[2]).toBeCloseTo(4, 6);
    expect(box.max[2]).toBeCloseTo(4.6, 6);
    plain.delete();
    body.delete();
    letters.delete();
  });

  it('side engraved letters cut into the wall and fill it exactly', async () => {
    const wasm = await getManifold();
    const sideParams = params({
      lettering: lettering({ placement: 'side', sizeMm: 2.5, depth: 0.6 }),
    });
    const plain = buildBase(wasm, params({}));
    const engraved = buildBase(wasm, sideParams, font);
    const letters = buildLetterSolids(wasm, sideParams, font);
    expect(engraved.status()).toBe('NoError');
    expect(engraved.volume()).toBeLessThan(plain.volume());
    expect(letters.volume()).toBeGreaterThan(0);
    expect(plain.volume() - engraved.volume()).toBeCloseTo(letters.volume(), 1);
    plain.delete();
    engraved.delete();
    letters.delete();
  });

  it('side embossed letters protrude beyond the footprint without overlapping the body', async () => {
    const wasm = await getManifold();
    const sideParams = params({
      lettering: lettering({ placement: 'side', style: 'embossed', sizeMm: 2.5, depth: 0.6 }),
    });
    const body = buildBase(wasm, sideParams, font);
    const letters = buildLetterSolids(wasm, sideParams, font);
    const overlap = body.intersect(letters);
    expect(letters.volume()).toBeGreaterThan(0);
    expect(overlap.volume()).toBeCloseTo(0, 4);
    const box = letters.boundingBox();
    const maxRadius = Math.max(
      Math.hypot(box.min[0], box.min[1]),
      Math.hypot(box.max[0], box.max[1]),
    );
    expect(maxRadius).toBeGreaterThan(20);
    body.delete();
    letters.delete();
    overlap.delete();
  });

  it('renders each font face with distinct geometry', async () => {
    const buffer = readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf'));
    const serif = initFontFromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      'serif',
    );
    const wasm = await getManifold();
    const sansLetters = buildLetterSolids(wasm, params({ lettering: lettering() }), font);
    const serifLetters = buildLetterSolids(wasm, params({ lettering: lettering() }), serif);
    expect(Math.abs(sansLetters.volume() - serifLetters.volume())).toBeGreaterThan(0.01);
    sansLetters.delete();
    serifLetters.delete();
  });
});

describe('lettering validation', () => {
  it('accepts the default lettering on a 40 mm round base', () => {
    expect(validate(params({ lettering: lettering() }))).toEqual([]);
  });

  const rejections: [string, BaseParams, string][] = [
    [
      'a non-round base',
      params({ shape: { kind: 'square', size: 40 }, lettering: lettering() }),
      'lettering-shape',
    ],
    ['empty text', params({ lettering: lettering({ text: '  ' }) }), 'lettering-text'],
    [
      'engraving through the hollow top',
      params({
        hollow: { wall: 2, topThickness: 1, supports: null },
        lettering: lettering({ depth: 1.2 }),
      }),
      'lettering-depth',
    ],
    [
      'text too long for the rim',
      params({ lettering: lettering({ text: 'AVERYLONGHERONAME', sizeMm: 8 }) }),
      'lettering-fit',
    ],
    [
      'side letters taller than the side wall',
      params({ lettering: lettering({ placement: 'side', sizeMm: 5 }) }),
      'lettering-side',
    ],
    [
      'side lettering combined with a rounded lip',
      params({ lipRadius: 1, lettering: lettering({ placement: 'side', sizeMm: 2.5 }) }),
      'lettering-side',
    ],
    [
      'side engraving deeper than the hollow wall',
      params({
        hollow: { wall: 1.5, topThickness: 1, supports: null },
        lettering: lettering({ placement: 'side', sizeMm: 2.5, depth: 1.6 }),
      }),
      'lettering-depth',
    ],
  ];

  it.each(rejections)('rejects %s', (_label, invalid, code) => {
    expect(validate(invalid).map((issue) => issue.code)).toContain(code);
  });
});
