import type { ManifoldToplevel, SimplePolygon } from 'manifold-3d';
import { withGeometryScope } from './dispose.ts';
import type { Point2 } from './tessellation.ts';
import { segmentsFor } from './tessellation.ts';

/**
 * Insets a convex outline polygon by `delta` mm (a true parallel offset, not
 * a scale). Returns the largest resulting contour. An outline whose inradius
 * is at most `delta` vanishes under the inset; that case is a programming
 * error because parameter validation must reject it beforehand.
 */
export function insetOutline(
  wasm: ManifoldToplevel,
  outline: Point2[],
  delta: number,
): SimplePolygon {
  if (delta === 0) {
    return outline;
  }
  return withGeometryScope((track) => {
    const section = track(wasm.CrossSection.ofPolygons([outline]));
    const offset = track(section.offset(-delta, 'Miter', 2));
    const simplified = track(offset.simplify(1e-6));
    const contours = simplified.toPolygons();
    if (contours.length === 0) {
      throw new Error(`The outline vanished when inset by ${delta} mm.`);
    }
    return largestContour(contours);
  });
}

/**
 * Outsets a convex outline by `delta` mm as a true parallel offset: sharp
 * corners become arcs at exactly `delta` distance, so a part dropped into
 * the grown pocket has `delta` clearance everywhere.
 */
export function outsetOutline(
  wasm: ManifoldToplevel,
  outline: Point2[],
  delta: number,
  tolMm: number,
  join: 'Round' | 'Miter' = 'Round',
): Point2[] {
  if (delta === 0) {
    return outline;
  }
  return withGeometryScope((track) => {
    const section = track(wasm.CrossSection.ofPolygons([outline]));
    const grown = track(section.offset(delta, join, 2, segmentsFor(delta, tolMm)));
    const simplified = track(grown.simplify(1e-6));
    return simplified.toPolygons()[0];
  });
}

function largestContour(contours: SimplePolygon[]): SimplePolygon {
  let best = contours[0];
  let bestArea = -Infinity;
  for (const contour of contours) {
    const area = Math.abs(signedArea(contour));
    if (area > bestArea) {
      bestArea = area;
      best = contour;
    }
  }
  return best;
}

/** Signed area via the shoelace formula; positive for CCW contours. */
export function signedArea(contour: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < contour.length; i++) {
    const [x1, y1] = contour[i];
    const [x2, y2] = contour[(i + 1) % contour.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
