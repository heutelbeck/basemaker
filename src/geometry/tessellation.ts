import type { ResolvedShape } from '../params/shapeMetrics.ts';

export type Point2 = [number, number];

export const MIN_SEGMENTS = 16;
export const MAX_SEGMENTS = 512;

/**
 * Number of segments for a full circle of radius `r` such that the sagitta
 * (max distance between chord and arc) stays at or below `tolMm`.
 */
export function segmentsFor(r: number, tolMm: number): number {
  if (!(r > 0)) {
    return MIN_SEGMENTS;
  }
  const cosHalf = Math.max(-1, 1 - tolMm / r);
  const theta = 2 * Math.acos(cosHalf);
  const segments = Math.ceil((2 * Math.PI) / theta);
  return Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, segments));
}

/** CCW circle outline centered on the origin. */
export function circleOutline(r: number, tolMm: number): Point2[] {
  const n = segmentsFor(r, tolMm);
  const points: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    points.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  return points;
}

/**
 * CCW ellipse outline with curvature-adaptive sampling: the parameter step is
 * chosen so each chord's sagitta against the local osculating circle stays at
 * or below `tolMm`, concentrating vertices at the tight ends of the ellipse.
 * One quarter is sampled and mirrored so the outline is symmetric in X and Y.
 */
export function ellipseOutline(a: number, b: number, tolMm: number): Point2[] {
  const quarterTs = adaptiveQuarterParameters(a, b, tolMm);
  const points: Point2[] = [];
  for (const t of quarterTs) {
    points.push([a * Math.cos(t), b * Math.sin(t)]);
  }
  for (let i = quarterTs.length - 1; i >= 0; i--) {
    const [x, y] = points[i];
    if (x !== 0) {
      points.push([-x, y]);
    }
  }
  const upperCount = points.length;
  for (let i = upperCount - 1; i >= 0; i--) {
    const [x, y] = points[i];
    if (y !== 0) {
      points.push([x, -y]);
    }
  }
  return points;
}

function adaptiveQuarterParameters(a: number, b: number, tolMm: number): number[] {
  const quarter = Math.PI / 2;
  const provisional: number[] = [];
  let t = 0;
  let guard = 0;
  while (t < quarter && guard < MAX_SEGMENTS) {
    provisional.push(t);
    t += parameterStep(a, b, t, tolMm);
    guard++;
  }
  const scale = quarter / t;
  const ts = provisional.map((value) => value * scale);
  ts.push(quarter);
  return ts;
}

function parameterStep(a: number, b: number, t: number, tolMm: number): number {
  const sin = Math.sin(t);
  const cos = Math.cos(t);
  const speedSq = a * a * sin * sin + b * b * cos * cos;
  const speed = Math.sqrt(speedSq);
  const curvatureRadius = (speedSq * speed) / (a * b);
  const cosHalf = Math.max(-1, 1 - tolMm / curvatureRadius);
  const arcAngle = 2 * Math.acos(cosHalf);
  const minStep = (2 * Math.PI) / MAX_SEGMENTS / 4;
  return Math.max((arcAngle * curvatureRadius) / speed, minStep);
}

/**
 * CCW stadium (pill) outline: two semicircle caps of radius `r` centered at
 * `(+flank, 0)` and `(-flank, 0)` joined by straight flanks.
 */
export function stadiumOutline(flank: number, r: number, tolMm: number): Point2[] {
  const capSegments = Math.max(2, Math.ceil(segmentsFor(r, tolMm) / 2));
  const points: Point2[] = [];
  for (let i = 0; i <= capSegments; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / capSegments;
    points.push([flank + r * Math.cos(t), r * Math.sin(t)]);
  }
  for (let i = 0; i <= capSegments; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / capSegments;
    points.push([-flank + r * Math.cos(t), r * Math.sin(t)]);
  }
  return points;
}

/** CCW rectangle outline centered on the origin. */
export function rectOutline(hx: number, hy: number): Point2[] {
  return [
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
    [-hx, -hy],
  ];
}

/** Outline polygon for any resolved footprint shape. */
export function outlineFor(shape: ResolvedShape, tolMm: number): Point2[] {
  switch (shape.type) {
    case 'circle':
      return circleOutline(shape.r, tolMm);
    case 'ellipse':
      return ellipseOutline(shape.a, shape.b, tolMm);
    case 'stadium':
      return stadiumOutline(shape.flank, shape.r, tolMm);
    case 'rect':
      return rectOutline(shape.hx, shape.hy);
  }
}
