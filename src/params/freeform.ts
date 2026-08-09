import { segmentsFor } from './tessellation.ts';
import type { Vec } from './polygon.ts';
import { convexHull, smoothClosedCurve, toCounterClockwise } from './polygon.ts';
import type { FreeformSpec } from './types.ts';

const SMOOTH_SAMPLES_PER_SEGMENT = 24;

/**
 * Generates the counterclockwise outline polygon for a freeform footprint.
 * Circles mode produces the convex tangent hull around all drawn circles:
 * sampling each circle at the chord tolerance and hulling the samples
 * yields arcs joined by straight tangent lines.
 */
export function freeformOutline(spec: FreeformSpec, tolMm: number): Vec[] {
  switch (spec.mode) {
    case 'polygon':
      return toCounterClockwise(spec.points);
    case 'smooth':
      return toCounterClockwise(smoothClosedCurve(spec.points, SMOOTH_SAMPLES_PER_SEGMENT));
    case 'circles': {
      const samples: Vec[] = [];
      spec.points.forEach(([cx, cy], index) => {
        const r = spec.radii[index] ?? 1;
        const n = segmentsFor(r, tolMm);
        for (let i = 0; i < n; i++) {
          const t = (2 * Math.PI * i) / n;
          samples.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
        }
      });
      return convexHull(samples);
    }
  }
}

export function defaultFreeformSpec(): FreeformSpec {
  return {
    kind: 'freeform',
    mode: 'circles',
    points: [
      [-10, -6],
      [12, -3],
      [1, 11],
    ],
    radii: [10, 8, 7],
  };
}
