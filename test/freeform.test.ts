import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { defaultFreeformSpec, freeformOutline } from '../src/params/freeform.ts';
import {
  convexHull,
  distanceToBoundary,
  isConvex,
  isSimplePolygon,
  pointInPolygon,
  polygonArea,
  smoothClosedCurve,
} from '../src/params/polygon.ts';
import type { BaseParams, FreeformSpec } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';
import { validate } from '../src/params/validate.ts';

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), height: 4, edgeSlope: 1.5, ...overrides };
}

function circlesSpec(): FreeformSpec {
  return defaultFreeformSpec();
}

describe('polygon math', () => {
  it('computes hulls that contain all input points', () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
      [3, 7],
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBeCloseTo(100, 9);
    expect(isConvex(hull)).toBe(true);
  });

  it('detects self-intersecting outlines', () => {
    const bowtie: [number, number][] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ];
    expect(isSimplePolygon(bowtie)).toBe(false);
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(isSimplePolygon(square)).toBe(true);
  });

  it('measures containment with an inset', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon(square, 5, 5)).toBe(true);
    expect(distanceToBoundary(square, 5, 5)).toBeCloseTo(5, 9);
    expect(pointInPolygon(square, 15, 5)).toBe(false);
  });

  it('closes smooth curves through the control points', () => {
    const triangle: [number, number][] = [
      [0, 0],
      [20, 0],
      [10, 15],
    ];
    const curve = smoothClosedCurve(triangle, 8);
    expect(curve).toHaveLength(24);
    for (const control of triangle) {
      const hit = curve.some(
        ([x, y]) => Math.abs(x - control[0]) < 1e-9 && Math.abs(y - control[1]) < 1e-9,
      );
      expect(hit).toBe(true);
    }
  });
});

describe('freeform outlines', () => {
  it('hulls circles into a convex tangent outline containing every circle', () => {
    const spec = circlesSpec();
    const outline = freeformOutline(spec, 0.02);
    expect(isConvex(outline)).toBe(true);
    spec.points.forEach(([cx, cy], index) => {
      const r = spec.radii[index];
      for (let t = 0; t < 2 * Math.PI; t += 0.3) {
        const x = cx + (r - 0.05) * Math.cos(t);
        const y = cy + (r - 0.05) * Math.sin(t);
        expect(pointInPolygon(outline, x, y)).toBe(true);
      }
    });
  });

  it('keeps a drawn polygon exactly as drawn', () => {
    const spec: FreeformSpec = {
      kind: 'freeform',
      mode: 'polygon',
      points: [
        [0, 0],
        [20, 0],
        [20, 10],
        [5, 10],
      ],
      radii: [],
    };
    const outline = freeformOutline(spec, 0.02);
    expect(polygonArea(outline)).toBeCloseTo(175, 6);
  });
});

describe('freeform bases', () => {
  it('builds a valid solid from a circles drawing with slope and hollow', async () => {
    const wasm = await getManifold();
    const solid = buildBase(
      wasm,
      params({
        shape: circlesSpec(),
        edgeSlope: 1,
        hollow: { wall: 2, topThickness: 1.2, supports: null },
      }),
    );
    expect(solid.status()).toBe('NoError');
    expect(solid.genus()).toBe(0);
    expect(solid.volume()).toBeGreaterThan(0);
    solid.delete();
  });

  it('preserves concave outlines when the sides are vertical', async () => {
    const wasm = await getManifold();
    const lShape: FreeformSpec = {
      kind: 'freeform',
      mode: 'polygon',
      points: [
        [0, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 20],
        [0, 20],
      ],
      radii: [],
    };
    const solid = buildBase(wasm, params({ shape: lShape, edgeSlope: 0, height: 3 }));
    expect(solid.status()).toBe('NoError');
    expect(solid.volume()).toBeCloseTo(300 * 3, 4);
    solid.delete();
  });

  it('rejects taper on a concave drawing', () => {
    const lShape: FreeformSpec = {
      kind: 'freeform',
      mode: 'polygon',
      points: [
        [0, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 20],
        [0, 20],
      ],
      radii: [],
    };
    const issues = validate(params({ shape: lShape, edgeSlope: 1.5 }));
    expect(issues.map((issue) => issue.code)).toContain('freeform-taper');
  });

  it('rejects a self-intersecting drawing', () => {
    const bowtie: FreeformSpec = {
      kind: 'freeform',
      mode: 'polygon',
      points: [
        [0, 0],
        [10, 0],
        [4, 6],
        [10, 6],
      ],
      radii: [],
    };
    const issues = validate(params({ shape: bowtie, edgeSlope: 0 }));
    expect(issues.map((issue) => issue.code)).toContain('freeform-self-intersecting');
  });

  it('accepts the default circles drawing with a slope', () => {
    expect(validate(params({ shape: circlesSpec(), edgeSlope: 1 }))).toEqual([]);
  });
});
