import { outlineFor } from './tessellation.ts';
import { topInsetFor } from './edgeProfile.ts';
import { freeformOutline } from './freeform.ts';
import type { Vec } from './polygon.ts';
import { isConvex, polygonContains } from './polygon.ts';
import { seededRng } from './random.ts';
import { pointInShape, resolveShape } from './shapeMetrics.ts';
import type { BaseParams, MagnetParams } from './types.ts';
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

interface Footprint {
  outline: Vec[];
  hx: number;
  hy: number;
  contains(x: number, y: number, margin: number): boolean;
}

function footprintOf(params: BaseParams): Footprint {
  const spec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
  if (spec.kind === 'freeform') {
    const outline = freeformOutline(spec, 0.1);
    const hx = Math.max(...outline.map(([x]) => Math.abs(x)));
    const hy = Math.max(...outline.map(([, y]) => Math.abs(y)));
    return {
      outline,
      hx,
      hy,
      contains: (x, y, margin) => polygonContains(outline, x, y, margin),
    };
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
  const cols = Math.min(
    count,
    Math.max(1, Math.round(Math.sqrt((count * usableHx) / usableHy))),
  );
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
  const clipRegion = isConvex(footprint.outline)
    ? insetConvex(footprint.outline, margin)
    : null;
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
 * Magnet slot centers for the selected layout: the classic centered line,
 * a grid spread over the footprint, or an equal-area centroidal Voronoi
 * distribution. Grid and equal-area layouts derive everything from the
 * footprint; spacing and offsets only apply to the line layout.
 */
export function magnetCenters(params: BaseParams): Vec[] {
  const magnets = params.magnets;
  if (magnets === null) {
    return [];
  }
  if (magnets.layout === 'line') {
    return magnetPositions(magnets.count, magnets.spacing, magnets.offsetX).map((x) => [
      x,
      magnets.offsetY,
    ]);
  }
  const footprint = footprintOf(params);
  const topInset = topInsetFor(params.height, params.edgeSlope, params.lipRadius, params.lipTopRadius);
  const margin = magnetHalfExtent(magnets) + magnets.padding + topInset + 0.3;
  return magnets.layout === 'grid'
    ? gridCenters(footprint, margin, magnets.count)
    : evenCenters(footprint, margin, magnets.count);
}
