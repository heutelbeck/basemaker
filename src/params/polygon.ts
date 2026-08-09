/** Pure 2D polygon math shared by freeform outlines, validation, and UI. */

export type Vec = [number, number];

/** Signed area via the shoelace formula; positive for CCW polygons. */
export function polygonArea(points: readonly Vec[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Ensures counterclockwise winding. */
export function toCounterClockwise(points: readonly Vec[]): Vec[] {
  return polygonArea(points) >= 0 ? [...points] : [...points].reverse();
}

/** Convex hull (Andrew monotone chain), returned counterclockwise. */
export function convexHull(points: readonly Vec[]): Vec[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) {
    return sorted;
  }
  const cross = (o: Vec, a: Vec, b: Vec) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function isConvex(points: readonly Vec[]): boolean {
  const n = points.length;
  if (n < 4) {
    return true;
  }
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % n];
    const [cx, cy] = points[(i + 2) % n];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) > 1e-9) {
      const current = Math.sign(cross);
      if (sign !== 0 && current !== sign) {
        return false;
      }
      sign = current;
    }
  }
  return true;
}

function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const orient = (p: Vec, q: Vec, r: Vec) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return (
    orient(a, b, c) !== orient(a, b, d) &&
    orient(c, d, a) !== orient(c, d, b) &&
    orient(a, b, c) !== 0 &&
    orient(a, b, d) !== 0
  );
}

/** Tests that no two non-adjacent edges cross. */
export function isSimplePolygon(points: readonly Vec[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        continue;
      }
      if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) {
        return false;
      }
    }
  }
  return true;
}

/** Ray-cast point-in-polygon test. */
export function pointInPolygon(points: readonly Vec[], x: number, y: number): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Minimum distance from a point to the polygon boundary. */
export function distanceToBoundary(points: readonly Vec[], x: number, y: number): number {
  let best = Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0 ? 0 : Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / lengthSq, 0), 1);
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/**
 * Tests whether a point lies inside the polygon with at least `inset` mm of
 * material between it and the boundary.
 */
export function polygonContains(
  points: readonly Vec[],
  x: number,
  y: number,
  inset: number,
): boolean {
  return pointInPolygon(points, x, y) && distanceToBoundary(points, x, y) >= inset;
}

/**
 * Closed Catmull-Rom spline through the given control points, sampled with
 * `samplesPerSegment` points per segment.
 */
export function smoothClosedCurve(points: readonly Vec[], samplesPerSegment: number): Vec[] {
  const n = points.length;
  if (n < 3) {
    return [...points];
  }
  const result: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return result;
}
