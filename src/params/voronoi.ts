import type { Vec } from './polygon.ts';

/**
 * Convex-cell math for realistic paving: Voronoi cells of a point set give
 * a joint network where every stone touches its neighbors with a constant
 * mortar gap, exactly like laid setts. Cells are convex, so insetting and
 * clipping reduce to half-plane intersections.
 */

/** Clips a convex polygon by the half-plane a*x + b*y <= c. */
export function clipByHalfPlane(polygon: Vec[], a: number, b: number, c: number): Vec[] {
  const result: Vec[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    const d1 = a * x1 + b * y1 - c;
    const d2 = a * x2 + b * y2 - c;
    if (d1 <= 0) {
      result.push([x1, y1]);
    }
    if ((d1 < 0 && d2 > 0) || (d1 > 0 && d2 < 0)) {
      const t = d1 / (d1 - d2);
      result.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
    }
  }
  return result;
}

/**
 * Voronoi cell of `site` within a rectangular bound, clipped against all
 * other sites within `pruneRadius`.
 */
function voronoiCell(
  site: Vec,
  sites: readonly Vec[],
  siteIndex: number,
  hx: number,
  hy: number,
  pruneRadius: number,
): Vec[] {
  let cell: Vec[] = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ];
  for (let j = 0; j < sites.length; j++) {
    if (j === siteIndex || cell.length === 0) {
      continue;
    }
    const other = sites[j];
    const dx = other[0] - site[0];
    const dy = other[1] - site[1];
    if (Math.hypot(dx, dy) > pruneRadius) {
      continue;
    }
    const mx = (site[0] + other[0]) / 2;
    const my = (site[1] + other[1]) / 2;
    cell = clipByHalfPlane(cell, dx, dy, dx * mx + dy * my);
  }
  return cell;
}

export function voronoiCells(
  sites: readonly Vec[],
  hx: number,
  hy: number,
  pruneRadius: number,
): Vec[][] {
  return sites.map((site, index) => voronoiCell(site, sites, index, hx, hy, pruneRadius));
}

export function polygonCentroid(polygon: readonly Vec[]): Vec {
  let areaSum = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const cross = x1 * y2 - x2 * y1;
    areaSum += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (areaSum === 0) {
    return polygon.length > 0 ? [...polygon[0]] : [0, 0];
  }
  return [cx / (3 * areaSum), cy / (3 * areaSum)];
}

/**
 * One Lloyd relaxation step: moving sites to their cell centroids evens
 * out stone sizes the way a paver evens out irregular setts.
 */
export function lloydRelax(
  sites: readonly Vec[],
  hx: number,
  hy: number,
  pruneRadius: number,
): Vec[] {
  return voronoiCells(sites, hx, hy, pruneRadius).map((cell, index) =>
    cell.length >= 3 ? polygonCentroid(cell) : [...sites[index]],
  );
}

/** Exact inward offset of a convex polygon by clipping its own edges. */
export function insetConvex(polygon: readonly Vec[], inset: number): Vec[] {
  let result: Vec[] = [...polygon];
  const n = polygon.length;
  for (let i = 0; i < n && result.length > 0; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    const ex = x2 - x1;
    const ey = y2 - y1;
    const length = Math.hypot(ex, ey);
    if (length === 0) {
      continue;
    }
    const nx = ey / length;
    const ny = -ex / length;
    const c = nx * x1 + ny * y1 - inset;
    result = clipByHalfPlane(result, nx, ny, c);
  }
  return result;
}

/** Intersection of a polygon with a convex clip region. */
export function clipToConvex(subject: readonly Vec[], clip: readonly Vec[]): Vec[] {
  let result: Vec[] = [...subject];
  const n = clip.length;
  for (let i = 0; i < n && result.length > 0; i++) {
    const [x1, y1] = clip[i];
    const [x2, y2] = clip[(i + 1) % n];
    const ex = x2 - x1;
    const ey = y2 - y1;
    const nx = ey;
    const ny = -ex;
    result = clipByHalfPlane(result, nx, ny, nx * x1 + ny * y1);
  }
  return result;
}
