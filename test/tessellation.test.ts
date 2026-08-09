import { describe, expect, it } from 'vitest';
import type { Point2 } from '../src/params/tessellation.ts';
import {
  MAX_SEGMENTS,
  MIN_SEGMENTS,
  circleOutline,
  ellipseOutline,
  rectOutline,
  segmentsFor,
  stadiumOutline,
} from '../src/params/tessellation.ts';
import { signedArea } from '../src/geometry/outlines.ts';

function midpoints(outline: Point2[]): Point2[] {
  return outline.map(([x1, y1], i) => {
    const [x2, y2] = outline[(i + 1) % outline.length];
    return [(x1 + x2) / 2, (y1 + y2) / 2] as Point2;
  });
}

function distanceToEllipse(a: number, b: number, x: number, y: number): number {
  const samples = 200000;
  let best = Infinity;
  for (let i = 0; i < samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    best = Math.min(best, Math.hypot(x - a * Math.cos(t), y - b * Math.sin(t)));
  }
  return best;
}

describe('segmentsFor', () => {
  it('yields about 63 segments for a 32 mm base at the 0.02 mm default', () => {
    expect(segmentsFor(16, 0.02)).toBeGreaterThanOrEqual(60);
    expect(segmentsFor(16, 0.02)).toBeLessThanOrEqual(66);
  });

  it('is monotone: more segments for larger radii and tighter tolerances', () => {
    expect(segmentsFor(50, 0.02)).toBeGreaterThan(segmentsFor(10, 0.02));
    expect(segmentsFor(16, 0.005)).toBeGreaterThan(segmentsFor(16, 0.05));
  });

  it('clamps to the segment range', () => {
    expect(segmentsFor(0.5, 0.5)).toBe(MIN_SEGMENTS);
    expect(segmentsFor(500, 0.002)).toBe(MAX_SEGMENTS);
  });
});

describe('circleOutline', () => {
  it.each([
    [12.5, 0.02],
    [16, 0.02],
    [16, 0.1],
    [80, 0.02],
  ])('keeps the chord error within tolerance for r=%s tol=%s', (r, tol) => {
    const outline = circleOutline(r, tol);
    for (const [x, y] of outline) {
      expect(Math.hypot(x, y)).toBeCloseTo(r, 9);
    }
    for (const [x, y] of midpoints(outline)) {
      expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(r - tol);
    }
  });

  it('is counterclockwise', () => {
    expect(signedArea(circleOutline(16, 0.02))).toBeGreaterThan(0);
  });
});

describe('ellipseOutline', () => {
  it.each([
    [30, 17.5, 0.02],
    [85, 52.5, 0.02],
    [30, 17.5, 0.1],
  ])('keeps the chord error within tolerance for a=%s b=%s tol=%s', (a, b, tol) => {
    const outline = ellipseOutline(a, b, tol);
    for (const [x, y] of outline) {
      expect((x * x) / (a * a) + (y * y) / (b * b)).toBeCloseTo(1, 9);
    }
    for (const [x, y] of midpoints(outline)) {
      expect(distanceToEllipse(a, b, x, y)).toBeLessThanOrEqual(tol * 1.05 + 0.005);
    }
  });

  it('concentrates vertices at the tight ends of the ellipse', () => {
    const outline = ellipseOutline(85, 30, 0.02);
    const nearEnd = outline.filter(([x]) => Math.abs(x) > 85 * 0.9).length;
    const nearMiddle = outline.filter(([x]) => Math.abs(x) < 85 * 0.1).length;
    expect(nearEnd).toBeGreaterThan(nearMiddle);
  });

  it('is counterclockwise and symmetric in both axes', () => {
    const outline = ellipseOutline(30, 17.5, 0.02);
    expect(signedArea(outline)).toBeGreaterThan(0);
    for (const [x, y] of outline) {
      const mirrored = outline.some(
        ([mx, my]) => Math.abs(mx + x) < 1e-9 && Math.abs(my - y) < 1e-9,
      );
      expect(mirrored).toBe(true);
    }
  });
});

describe('stadiumOutline', () => {
  it('keeps cap chord error within tolerance and flanks straight', () => {
    const flank = 17.5;
    const r = 12.5;
    const tol = 0.02;
    const outline = stadiumOutline(flank, r, tol);
    for (const [x, y] of outline) {
      const capX = x >= 0 ? flank : -flank;
      const onCap = Math.abs(Math.hypot(x - capX, y) - r) < 1e-9;
      const onFlank = Math.abs(Math.abs(y) - r) < 1e-9 && Math.abs(x) <= flank + 1e-9;
      expect(onCap || onFlank).toBe(true);
    }
    for (const [x, y] of midpoints(outline)) {
      const capX = x >= 0 ? flank : -flank;
      if (Math.abs(x) > flank) {
        expect(Math.hypot(x - capX, y)).toBeGreaterThanOrEqual(r - tol);
      }
    }
    expect(signedArea(outline)).toBeGreaterThan(0);
  });
});

describe('rectOutline', () => {
  it('spans the requested extents counterclockwise', () => {
    const outline = rectOutline(25, 12.5);
    expect(signedArea(outline)).toBeCloseTo(4 * 25 * 12.5, 9);
  });
});
