import type { ShapeSpec } from './types.ts';
import { GW_OVAL_SIZES } from './types.ts';

/**
 * Analytic footprint of a shape, normalized to four primitive families.
 * All shapes are centered on the origin with the long axis along X.
 */
export type ResolvedShape =
  | { type: 'circle'; r: number }
  | { type: 'ellipse'; a: number; b: number }
  | { type: 'stadium'; flank: number; r: number }
  | { type: 'rect'; hx: number; hy: number }
  | { type: 'hex'; acrossFlats: number };

export function resolveShape(shape: ShapeSpec): ResolvedShape {
  switch (shape.kind) {
    case 'round':
      return { type: 'circle', r: shape.diameter / 2 };
    case 'oval':
      return { type: 'ellipse', a: shape.length / 2, b: shape.width / 2 };
    case 'gwOval': {
      const { length, width } = GW_OVAL_SIZES[shape.preset];
      return { type: 'ellipse', a: length / 2, b: width / 2 };
    }
    case 'pill': {
      const r = shape.width / 2;
      return { type: 'stadium', flank: shape.length / 2 - r, r };
    }
    case 'square':
      return { type: 'rect', hx: shape.size / 2, hy: shape.size / 2 };
    case 'rect':
      return { type: 'rect', hx: shape.length / 2, hy: shape.width / 2 };
    case 'hex':
      return { type: 'hex', acrossFlats: shape.size };
  }
}

/** Radius of the largest origin-centered circle fully inside the shape. */
export function inradius(shape: ResolvedShape): number {
  switch (shape.type) {
    case 'circle':
      return shape.r;
    case 'ellipse':
      return Math.min(shape.a, shape.b);
    case 'stadium':
      return shape.r;
    case 'rect':
      return Math.min(shape.hx, shape.hy);
    case 'hex':
      return shape.acrossFlats / 2;
  }
}

/** Half-extents of the shape's bounding box. */
export function halfExtents(shape: ResolvedShape): { hx: number; hy: number } {
  switch (shape.type) {
    case 'circle':
      return { hx: shape.r, hy: shape.r };
    case 'ellipse':
      return { hx: shape.a, hy: shape.b };
    case 'stadium':
      return { hx: shape.flank + shape.r, hy: shape.r };
    case 'rect':
      return { hx: shape.hx, hy: shape.hy };
    case 'hex':
      return { hx: shape.acrossFlats / Math.sqrt(3), hy: shape.acrossFlats / 2 };
  }
}

/**
 * Tests whether a point lies inside the shape shrunk inward by `inset` mm.
 * Exact for circle, stadium, and rect. For ellipses the shrunk region is
 * approximated by the ellipse with both semi-axes reduced by `inset`, which
 * is slightly conservative; validation guardrails only need that accuracy.
 */
export function pointInShape(shape: ResolvedShape, x: number, y: number, inset = 0): boolean {
  switch (shape.type) {
    case 'circle':
      return Math.hypot(x, y) <= shape.r - inset;
    case 'ellipse': {
      const a = shape.a - inset;
      const b = shape.b - inset;
      if (a <= 0 || b <= 0) {
        return false;
      }
      return (x * x) / (a * a) + (y * y) / (b * b) <= 1;
    }
    case 'stadium': {
      const r = shape.r - inset;
      const nearestFlankX = Math.min(Math.max(x, -shape.flank), shape.flank);
      return Math.hypot(x - nearestFlankX, y) <= r;
    }
    case 'rect':
      return Math.abs(x) <= shape.hx - inset && Math.abs(y) <= shape.hy - inset;
    case 'hex': {
      const a = shape.acrossFlats / 2 - inset;
      const c = Math.sqrt(3) / 2;
      return (
        Math.abs(y) <= a &&
        Math.abs(x * c + y / 2) <= a &&
        Math.abs(x * c - y / 2) <= a
      );
    }
  }
}
