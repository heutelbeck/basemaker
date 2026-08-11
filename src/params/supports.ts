import { computeEdgeProfile, profileInsetAt } from './edgeProfile.ts';
import { freeformOutline } from './freeform.ts';
import type { Vec } from './polygon.ts';
import { polygonContains } from './polygon.ts';
import { halfExtents, pointInShape, resolveShape } from './shapeMetrics.ts';
import type { BaseParams } from './types.ts';
import { SLOTTA_RIM } from './types.ts';
import { magnetCenters } from './magnetLayout.ts';

/** Pillars stay clear of the hollow rim by this much so they never merge. */
const GAP_TO_WALL = 1;
/** Pillars skip spots this close to housings that already act as supports. */
const AVOID_MARGIN = 0.5;

/**
 * Centers for the auto-fill support pillar grid inside a hollow base: a
 * center-symmetric square grid clipped to the cavity with a clearance gap
 * to the inner wall, skipping positions already supported by magnet
 * housings or the slotta housing.
 */
export function supportPillarCenters(params: BaseParams): Vec[] {
  const hollow = params.hollow;
  if (hollow === null || hollow.supports === null) {
    return [];
  }
  const { spacing, diameter } = hollow.supports;
  const pillarRadius = diameter / 2;
  const outerSpec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
  const profile = computeEdgeProfile(params.height, params.edgeSlope, params.lipRadius, 0.02, params.lipTopRadius);
  const ceiling = params.height - hollow.topThickness;
  const inset = profileInsetAt(profile, ceiling) + hollow.wall + pillarRadius + GAP_TO_WALL;

  let contains: (x: number, y: number) => boolean;
  let extent: { hx: number; hy: number };
  if (outerSpec.kind === 'freeform') {
    const outline = freeformOutline(outerSpec, 0.05);
    contains = (x, y) => polygonContains(outline, x, y, inset);
    const xs = outline.map(([x]) => Math.abs(x));
    const ys = outline.map(([, y]) => Math.abs(y));
    extent = { hx: Math.max(...xs), hy: Math.max(...ys) };
  } else {
    const resolved = resolveShape(outerSpec);
    contains = (x, y) => pointInShape(resolved, x, y, inset);
    extent = halfExtents(resolved);
  }

  const blocked = blockedSpots(params, pillarRadius);
  const centers: Vec[] = [];
  const stepsX = Math.floor(extent.hx / spacing);
  const stepsY = Math.floor(extent.hy / spacing);
  for (let i = -stepsX; i <= stepsX; i++) {
    for (let j = -stepsY; j <= stepsY; j++) {
      const x = i * spacing;
      const y = j * spacing;
      if (contains(x, y) && !blocked(x, y)) {
        centers.push([x, y]);
      }
    }
  }
  return centers;
}

function blockedSpots(params: BaseParams, pillarRadius: number): (x: number, y: number) => boolean {
  const checks: ((x: number, y: number) => boolean)[] = [];
  const magnets = params.magnets;
  if (magnets !== null) {
    const housingRadius =
      (magnets.shape === 'round'
        ? magnets.diameter / 2
        : Math.hypot(magnets.length, magnets.width) / 2) + magnets.padding;
    const keepOut = housingRadius + pillarRadius + AVOID_MARGIN;
    for (const [mx, my] of magnetCenters(params)) {
      checks.push((x, y) => Math.hypot(x - mx, y - my) < keepOut);
    }
  }
  const slotta = params.slotta;
  if (slotta !== null) {
    const angle = (-slotta.angleDeg * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfLength = slotta.length / 2 + SLOTTA_RIM;
    const halfWidth = slotta.width / 2 + SLOTTA_RIM;
    const keepOut = pillarRadius + AVOID_MARGIN;
    checks.push((x, y) => {
      const dx = x - slotta.offsetX;
      const dy = y - slotta.offsetY;
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      const nearestX = Math.min(Math.max(localX, -halfLength), halfLength);
      const nearestY = Math.min(Math.max(localY, -halfWidth), halfWidth);
      return Math.hypot(localX - nearestX, localY - nearestY) < keepOut;
    });
  }
  return (x, y) => checks.some((check) => check(x, y));
}
