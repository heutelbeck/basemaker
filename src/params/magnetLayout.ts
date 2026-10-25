import { outlineFor } from './tessellation.ts';
import { topInsetFor } from './edgeProfile.ts';
import { freeformOutline } from './freeform.ts';
import { holeCircumradius } from './mountingHoles.ts';
import type { Vec } from './polygon.ts';
import { distanceToBoundary, isConvex, polygonContains } from './polygon.ts';
import { seededRng } from './random.ts';
import { pointInShape, resolveShape } from './shapeMetrics.ts';
import type { BaseParams, MagnetParams, SlottaParams } from './types.ts';
import { SLOTTA_RIM } from './types.ts';
import { clipToConvex, insetConvex, polygonCentroid, voronoiCells } from './voronoi.ts';

/** Positions of a line layout along x, centered around offsetX. */
export function magnetPositions(count: number, spacing: number, offsetX: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(offsetX + i * spacing - ((count - 1) * spacing) / 2);
  }
  return positions;
}

function magnetHalfExtent(magnets: MagnetParams): number {
  return magnets.shape === 'round'
    ? magnets.diameter / 2
    : Math.max(magnets.length, magnets.width) / 2;
}

/**
 * Radius around a magnet center that its slot plus holder padding claims,
 * using the circumradius for rectangular slots.
 */
function magnetReach(magnets: MagnetParams): number {
  return (
    (magnets.shape === 'round' ? magnets.diameter : Math.hypot(magnets.length, magnets.width)) / 2 +
    magnets.padding
  );
}

/**
 * Signed clearance of a point to a feature the magnet holders must keep
 * away from: zero or less means a holder centered there would touch it.
 */
type Obstacle = (x: number, y: number) => number;

function slottaObstacle(slotta: SlottaParams): Obstacle {
  const angle = (-slotta.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfLength = slotta.length / 2 + SLOTTA_RIM;
  const halfWidth = slotta.width / 2 + SLOTTA_RIM;
  return (x, y) => {
    const dx = x - slotta.offsetX;
    const dy = y - slotta.offsetY;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const nearestX = Math.min(Math.max(localX, -halfLength), halfLength);
    const nearestY = Math.min(Math.max(localY, -halfWidth), halfWidth);
    return Math.hypot(localX - nearestX, localY - nearestY);
  };
}

function baseObstacles(params: BaseParams): Obstacle[] {
  const obstacles: Obstacle[] = [];
  if (params.slotta !== null) {
    obstacles.push(slottaObstacle(params.slotta));
  }
  for (const hole of params.mountingHoles?.holes ?? []) {
    const reach = holeCircumradius(hole) + hole.rimMm;
    obstacles.push((x, y) => Math.hypot(x - hole.offsetX, y - hole.offsetY) - reach);
  }
  return obstacles;
}

interface Footprint {
  outline: Vec[];
  hx: number;
  hy: number;
  contains(x: number, y: number, margin: number): boolean;
}

function footprintOf(params: BaseParams): Footprint {
  const spec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
  if (spec.kind === 'freeform') {
    return polygonFootprint(freeformOutline(spec, 0.1));
  }
  const resolved = resolveShape(spec);
  const outline = outlineFor(resolved, 0.1) as Vec[];
  const hx = Math.max(...outline.map(([x]) => Math.abs(x)));
  const hy = Math.max(...outline.map(([, y]) => Math.abs(y)));
  return {
    outline,
    hx,
    hy,
    contains: (x, y, margin) => pointInShape(resolved, x, y, margin),
  };
}

function pullInside(footprint: Footprint, margin: number, x: number, y: number): Vec {
  let px = x;
  let py = y;
  for (let i = 0; i < 40 && !footprint.contains(px, py, margin); i++) {
    px *= 0.94;
    py *= 0.94;
  }
  return [px, py];
}

function gridCenters(footprint: Footprint, margin: number, count: number): Vec[] {
  const usableHx = Math.max(0.1, footprint.hx - margin);
  const usableHy = Math.max(0.1, footprint.hy - margin);
  const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * usableHx) / usableHy))));
  const rows = Math.ceil(count / cols);
  const pitchX = (2 * usableHx) / cols;
  const pitchY = rows > 1 ? (2 * usableHy) / (rows - 1) : 0;
  const centers: Vec[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(cols, count - row * cols);
    for (let i = 0; i < inRow; i++) {
      const x = (i - (inRow - 1) / 2) * pitchX;
      const y = rows > 1 ? row * pitchY - usableHy : 0;
      centers.push(pullInside(footprint, margin, x, y));
    }
  }
  return centers;
}

/**
 * Centroidal Voronoi layout: seeded start points relax with Lloyd
 * iterations against the footprint, so every magnet ends up responsible
 * for a near-equal share of the base area.
 */
function evenCenters(footprint: Footprint, margin: number, count: number): Vec[] {
  const rng = seededRng(count * 7919 + 101);
  let sites: Vec[] = [];
  for (let attempt = 0; attempt < 400 && sites.length < count; attempt++) {
    const x = (rng() * 2 - 1) * (footprint.hx - margin);
    const y = (rng() * 2 - 1) * (footprint.hy - margin);
    if (footprint.contains(x, y, margin)) {
      sites.push([x, y]);
    }
  }
  if (sites.length < count) {
    return gridCenters(footprint, margin, count);
  }
  const clipRegion = isConvex(footprint.outline) ? insetConvex(footprint.outline, margin) : null;
  const reach = 4 * Math.max(footprint.hx, footprint.hy);
  for (let iteration = 0; iteration < 16; iteration++) {
    const cells = voronoiCells(sites, footprint.hx, footprint.hy, reach);
    sites = sites.map((site, index) => {
      const cell = clipRegion !== null ? clipToConvex(cells[index], clipRegion) : cells[index];
      if (cell.length < 3) {
        return site;
      }
      const centroid = polygonCentroid(cell);
      return pullInside(footprint, margin, centroid[0], centroid[1]);
    });
  }
  return sites;
}

/**
 * Greedy maximin placement into the space the obstacles leave free: each
 * magnet takes the sampled spot whose smallest clearance to the outline,
 * the obstacles, and the magnets placed before it is largest, so holders
 * settle in the middle of the open areas. Returns null when not every
 * magnet finds a spot clear of everything.
 */
function freeAreaCenters(
  footprint: Footprint,
  margin: number,
  count: number,
  reach: number,
  obstacles: readonly Obstacle[],
  slotFits: (x: number, y: number) => boolean,
): Vec[] | null {
  const clearance = (x: number, y: number): number => {
    if (!footprint.contains(x, y, margin) || !slotFits(x, y)) {
      return -Infinity;
    }
    const edgeClearance = distanceToBoundary(footprint.outline, x, y) - margin;
    return obstacles.reduce(
      (least, obstacle) => Math.min(least, obstacle(x, y) - reach),
      edgeClearance,
    );
  };
  const step = Math.max(0.25, Math.min(footprint.hx, footprint.hy) / 40);
  const startX = -Math.floor(footprint.hx / step) * step;
  const startY = -Math.floor(footprint.hy / step) * step;
  const candidates: Vec[] = [];
  for (let y = startY; y <= footprint.hy; y += step) {
    for (let x = startX; x <= footprint.hx; x += step) {
      if (clearance(x, y) > 0) {
        candidates.push([x, y]);
      }
    }
  }
  const centers: Vec[] = [];
  const score = ([x, y]: Vec): number =>
    centers.reduce(
      (least, [cx, cy]) => Math.min(least, Math.hypot(x - cx, y - cy) - 2 * reach),
      clearance(x, y),
    );
  for (let i = 0; i < count; i++) {
    let best: Vec | null = null;
    let bestScore = 0;
    for (const point of candidates) {
      const candidateScore = score(point);
      if (candidateScore > bestScore) {
        best = point;
        bestScore = candidateScore;
      }
    }
    if (best === null) {
      return null;
    }
    centers.push(refineSpot(best, step, score));
  }
  return centers;
}

/**
 * Pattern search that polishes a sampled spot to sub-grid precision, so
 * symmetric free areas yield symmetric placements.
 */
function refineSpot(start: Vec, step: number, score: (point: Vec) => number): Vec {
  let best = start;
  let bestScore = score(start);
  for (let size = step / 2; size > 0.005; size /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let k = 0; k < 8; k++) {
        const angle = (Math.PI * k) / 4;
        const point: Vec = [best[0] + size * Math.cos(angle), best[1] + size * Math.sin(angle)];
        const pointScore = score(point);
        if (pointScore > bestScore + 1e-9) {
          best = point;
          bestScore = pointScore;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Magnet slot centers for the selected layout: the classic centered line,
 * a grid spread over the footprint, or an equal-area centroidal Voronoi
 * distribution. Grid and equal-area layouts derive everything from the
 * footprint; spacing and offsets only apply to the line layout. When a slotta slot
 * or mounting holes occupy the base, grid and equal-area layouts move the
 * holders into the free areas around them instead.
 */
export function magnetCenters(params: BaseParams): Vec[] {
  const magnets = params.magnets;
  if (magnets === null) {
    return [];
  }
  const topInset = topInsetFor(
    params.height,
    params.edgeSlope,
    params.lipRadius,
    params.lipTopRadius,
  );
  return layoutCenters(magnets, () => footprintOf(params), topInset, baseObstacles(params));
}

/**
 * Magnet slot of a base: the magnet grown in depth by the glue height,
 * or null when the base has no magnets.
 */
export function baseMagnetSlot(params: BaseParams): MagnetParams | null {
  return params.magnets === null
    ? null
    : { ...params.magnets, depth: params.magnets.depth + params.magnetGlueHeightMm };
}

/** Width of each glue slot through a magnet housing wall. */
export const GLUE_SLOT_WIDTH_MM = 1;

/**
 * One glue slot bar per magnet: centered on the magnet, `length` long
 * across the whole housing so it opens the wall on both ends, turned by
 * `angleDeg` about Z.
 */
export interface GlueSlot {
  x: number;
  y: number;
  length: number;
  angleDeg: number;
}

/**
 * Glue slots through the housing wall of each magnet. Round housings are
 * slotted at right angles to the line from the base center, so neither
 * slot points at the rim; rectangular housings through their short sides.
 */
export function magnetGlueSlots(magnets: MagnetParams, centers: Vec[]): GlueSlot[] {
  return centers.map(([x, y]) => {
    if (magnets.shape === 'rect') {
      const alongX = magnets.length >= magnets.width;
      return {
        x,
        y,
        length: (alongX ? magnets.length : magnets.width) + 2 * magnets.padding,
        angleDeg: alongX ? 0 : 90,
      };
    }
    const angleDeg = Math.hypot(x, y) < 1e-6 ? 0 : (Math.atan2(y, x) * 180) / Math.PI + 90;
    return { x, y, length: magnets.diameter + 2 * magnets.padding, angleDeg };
  });
}

/**
 * Magnet slot centers inside an arbitrary polygon footprint, keeping
 * `edgeInset` mm of extra margin to the outline.
 */
export function magnetCentersInOutline(
  magnets: MagnetParams,
  outline: Vec[],
  edgeInset: number,
): Vec[] {
  return layoutCenters(magnets, () => polygonFootprint(outline), edgeInset);
}

function polygonFootprint(outline: Vec[]): Footprint {
  const hx = Math.max(...outline.map(([x]) => Math.abs(x)));
  const hy = Math.max(...outline.map(([, y]) => Math.abs(y)));
  return {
    outline,
    hx,
    hy,
    contains: (x, y, margin) => polygonContains(outline, x, y, margin),
  };
}

function layoutCenters(
  magnets: MagnetParams,
  footprint: () => Footprint,
  edgeInset: number,
  obstacles: readonly Obstacle[] = [],
): Vec[] {
  if (magnets.layout === 'line') {
    return magnetPositions(magnets.count, magnets.spacing, magnets.offsetX).map((x) => [
      x,
      magnets.offsetY,
    ]);
  }
  const margin = magnetHalfExtent(magnets) + magnets.padding + edgeInset + 0.3;
  if (obstacles.length > 0) {
    const area = footprint();
    const halfX = (magnets.shape === 'round' ? magnets.diameter : magnets.length) / 2;
    const halfY = (magnets.shape === 'round' ? magnets.diameter : magnets.width) / 2;
    const boxX = halfX + magnets.padding;
    const boxY = halfY + magnets.padding;
    // The same padded bounding box test the slot validation applies.
    const slotFits = (x: number, y: number) =>
      [-1, 1].every((sx) =>
        [-1, 1].every((sy) => area.contains(x + sx * boxX, y + sy * boxY, edgeInset)),
      );
    const free = freeAreaCenters(
      area,
      margin,
      magnets.count,
      magnetReach(magnets),
      obstacles,
      slotFits,
    );
    if (free !== null) {
      return free;
    }
  }
  return magnets.layout === 'grid'
    ? gridCenters(footprint(), margin, magnets.count)
    : evenCenters(footprint(), margin, magnets.count);
}
