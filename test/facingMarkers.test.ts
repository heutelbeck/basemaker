import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { FacingMarkerStyle } from '../src/params/facingMarkers.ts';
import { frontArcMarkers, markerProfilePolygons } from '../src/params/facingMarkers.ts';
import type { BaseParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';
import { validate } from '../src/params/validate.ts';

const ALL_STYLES: FacingMarkerStyle[] = [
  'line',
  'triangleUp',
  'triangleDown',
  'topNotch',
  'bottomNotch',
];

function markedParams(overrides: Partial<BaseParams> = {}): BaseParams {
  return { ...defaultParams(), facingMarkers: frontArcMarkers(), ...overrides };
}

function polygonArea(points: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

describe('markerProfilePolygons', () => {
  it.each(ALL_STYLES.map((style) => [style]))(
    'produces counterclockwise polygons spanning the wall height for %s',
    (style) => {
      const polygons = markerProfilePolygons(
        { angleDeg: 0, style, widthMm: 2.5, lineWidthMm: 0.8 },
        3.4,
      );
      expect(polygons.length).toBeGreaterThan(0);
      for (const polygon of polygons) {
        expect(polygonArea(polygon)).toBeGreaterThan(0);
        expect(Math.max(...polygon.map(([x]) => Math.abs(x)))).toBeLessThanOrEqual(1.25);
      }
      const ys = polygons.flat().map(([, y]) => y);
      expect(Math.min(...ys)).toBeLessThan(0);
      expect(Math.max(...ys)).toBeGreaterThan(3.4);
    },
  );

  it('caps the notch triangle height at half the wall height', () => {
    const polygons = markerProfilePolygons(
      { angleDeg: 0, style: 'topNotch', widthMm: 10, lineWidthMm: 0.8 },
      3.4,
    );
    const triangle = polygons[1];
    const apexY = Math.min(...triangle.map(([, y]) => y));
    expect(apexY).toBeCloseTo(3.4 - 1.7, 6);
  });
});

describe('validate facing markers', () => {
  it('accepts the default front arc marking on a plain round base', () => {
    expect(validate(markedParams())).toEqual([]);
  });

  it('accepts markers on square, hex, and oval bases', () => {
    const shapes: BaseParams['shape'][] = [
      { kind: 'square', size: 40 },
      { kind: 'hex', size: 40 },
      { kind: 'oval', length: 60, width: 35 },
    ];
    for (const shape of shapes) {
      expect(validate(markedParams({ shape }))).toEqual([]);
    }
  });

  it('rejects a depth that would pierce the hollow wall', () => {
    const params = markedParams({
      shape: { kind: 'round', diameter: 40 },
      hollow: { wall: 1.1, topThickness: 1, supports: null },
    });
    params.facingMarkers = { ...frontArcMarkers(), depth: 1.2 };
    const issues = validate(params);
    expect(issues.map((issue) => issue.code)).toContain('facing-marker-depth');
  });

  it('rejects a marker width outside the allowed range', () => {
    const params = markedParams();
    params.facingMarkers = {
      depth: 0.4,
      markers: [{ angleDeg: 0, style: 'line', widthMm: 0.1, lineWidthMm: 0.8 }],
    };
    const issues = validate(params);
    expect(issues.map((issue) => issue.code)).toContain('facing-marker-width');
  });
});

describe('buildBase with facing markers', () => {
  it('engraves material without breaking the manifold on a sloped round base', async () => {
    const wasm = await getManifold();
    const plain = buildBase(wasm, defaultParams());
    const marked = buildBase(wasm, markedParams());
    expect(marked.status()).toBe('NoError');
    expect(marked.genus()).toBe(0);
    expect(marked.volume()).toBeLessThan(plain.volume());
    plain.delete();
    marked.delete();
  });

  it.each(ALL_STYLES.map((style) => [style]))(
    'cuts a valid groove for the %s style on a square base',
    async (style) => {
      const wasm = await getManifold();
      const params = markedParams({ shape: { kind: 'square', size: 30 } });
      params.facingMarkers = {
        depth: 0.4,
        markers: [{ angleDeg: 90, style, widthMm: 2.5, lineWidthMm: 0.8 }],
      };
      const plain = buildBase(wasm, { ...params, facingMarkers: null });
      const marked = buildBase(wasm, params);
      expect(marked.status()).toBe('NoError');
      expect(marked.volume()).toBeLessThan(plain.volume());
      plain.delete();
      marked.delete();
    },
  );

  it('places a 90 degree marker on the +Y side of the rim only', async () => {
    const wasm = await getManifold();
    const params = markedParams();
    params.facingMarkers = {
      depth: 0.4,
      markers: [{ angleDeg: 90, style: 'line', widthMm: 2.5, lineWidthMm: 0.8 }],
    };
    const plain = buildBase(wasm, { ...params, facingMarkers: null });
    const marked = buildBase(wasm, params);
    const removed = plain.subtract(marked);
    const box = wasm.Manifold.cube([40, 20, 10], true);
    const frontHalf = box.translate(0, 10, 0);
    const backHalf = box.translate(0, -10, 0);
    const frontCut = removed.intersect(frontHalf);
    const backCut = removed.intersect(backHalf);
    expect(frontCut.volume()).toBeGreaterThan(0.1);
    expect(backCut.volume()).toBeCloseTo(0, 6);
    for (const solid of [plain, marked, removed, box, frontHalf, backHalf, frontCut, backCut]) {
      solid.delete();
    }
  });

  it('keeps a uniform engraving on a lipped Warmachine-style wall', async () => {
    const wasm = await getManifold();
    const params = markedParams({
      shape: { kind: 'round', diameter: 30 },
      height: 4.45,
      edgeSlope: 0,
      lipRadius: 4.75,
      lipTopRadius: 0.3,
    });
    params.facingMarkers = {
      depth: 0.4,
      markers: [
        { angleDeg: 0, style: 'line', widthMm: 0.8, lineWidthMm: 0.8 },
        { angleDeg: 180, style: 'line', widthMm: 0.8, lineWidthMm: 0.8 },
      ],
    };
    const plain = buildBase(wasm, { ...params, facingMarkers: null });
    const marked = buildBase(wasm, params);
    const removed = plain.volume() - marked.volume();
    expect(marked.status()).toBe('NoError');
    expect(removed).toBeGreaterThan(0.5);
    expect(removed).toBeLessThan(10);
    plain.delete();
    marked.delete();
  });
});
