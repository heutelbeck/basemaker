import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { MountingHoleSpec } from '../../params/mountingHoles.ts';
import { segmentsFor } from '../../params/tessellation.ts';
import type { Track } from '../dispose.ts';
import { CUT_EPSILON } from './shell.ts';

/**
 * Cutters for the mounting holes: one vertical through-prism per hole,
 * round or hex, at the hole's offset and rotation.
 */
export function mountingHoleCutters(
  wasm: ManifoldToplevel,
  track: Track,
  holes: MountingHoleSpec[],
  height: number,
  tol: number,
): Manifold[] {
  return holes.map((hole) =>
    placedPrism(wasm, track, hole, 0, height + 2 * CUT_EPSILON, -CUT_EPSILON, tol),
  );
}

/**
 * Housings for hollow bases: a full-height tube footprint around each
 * hole so the hole keeps its structural rim down to the bottom rim.
 * Callers intersect the result with the outer solid before adding it.
 */
export function mountingHoleHousings(
  wasm: ManifoldToplevel,
  track: Track,
  holes: MountingHoleSpec[],
  height: number,
  tol: number,
): Manifold {
  const tubes = holes.map((hole) => placedPrism(wasm, track, hole, hole.rimMm, height, 0, tol));
  return track(wasm.Manifold.union(tubes));
}

function placedPrism(
  wasm: ManifoldToplevel,
  track: Track,
  hole: MountingHoleSpec,
  grow: number,
  height: number,
  zBottom: number,
  tol: number,
): Manifold {
  let prism: Manifold;
  if (hole.shape === 'round') {
    const radius = hole.sizeMm / 2 + grow;
    prism = track(wasm.Manifold.cylinder(height, radius, radius, segmentsFor(radius, tol), false));
  } else {
    const circumradius = (hole.sizeMm + 2 * grow) / Math.sqrt(3);
    // A 6-segment cylinder starts its first vertex at +X, matching the
    // hexOutline convention of the hex base shape, so rotation 0 keeps
    // holes and hex bases aligned.
    prism = track(wasm.Manifold.cylinder(height, circumradius, circumradius, 6, false));
    prism = track(prism.rotate(0, 0, hole.rotationDeg));
  }
  return track(prism.translate(hole.offsetX, hole.offsetY, zBottom));
}
