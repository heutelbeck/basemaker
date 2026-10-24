import type { Vec3 } from 'manifold-3d';
import { segmentsFor } from '../params/tessellation.ts';

/**
 * Outline of a rounded square of half size `half` and corner `radius` at
 * height `z`, as points for a convex hull.
 */
export function roundedRectPoints(half: number, radius: number, z: number, tol: number): Vec3[] {
  const core = half - radius;
  const perCorner = Math.max(4, Math.ceil(segmentsFor(radius, tol) / 4));
  const points: Vec3[] = [];
  const corners: [number, number, number][] = [
    [core, core, 0],
    [-core, core, Math.PI / 2],
    [-core, -core, Math.PI],
    [core, -core, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const angle = start + ((Math.PI / 2) * i) / perCorner;
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z]);
    }
  }
  return points;
}
