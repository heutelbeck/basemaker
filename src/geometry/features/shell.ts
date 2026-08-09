import type { Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d';
import type { EdgeProfile } from '../../params/edgeProfile.ts';
import { profileInsetAt } from '../../params/edgeProfile.ts';
import type { HollowParams } from '../../params/types.ts';
import type { Track } from '../dispose.ts';
import { insetOutline } from '../outlines.ts';
import type { Point2 } from '../tessellation.ts';

/** Overshoot for cutters so no cutter face is exactly coplanar with the solid. */
export const CUT_EPSILON = 0.01;

/**
 * Footprint outlines of the profiled body. The nominal size is the bottom
 * rim; the wall follows the edge profile inward going up, so the top face
 * is inset by the profile's total top inset.
 */
export interface ShellOutlines {
  top: Point2[];
  bottom: Point2[];
}

export function shellOutlines(
  wasm: ManifoldToplevel,
  bottomOutline: Point2[],
  profile: EdgeProfile,
): ShellOutlines {
  return {
    top: insetOutline(wasm, bottomOutline, profile.topInset),
    bottom: bottomOutline,
  };
}

/**
 * Builds the profiled solid body. A body without taper is extruded
 * directly, which also supports concave footprints. A tapered body is the
 * convex hull of outline rings placed at each profile sample; validation
 * guarantees tapered footprints are convex, and the profile is convex, so
 * the hull reproduces the body exactly (straight taper) or within the
 * sampling tolerance (rounded lip).
 */
export function buildShellSolid(
  wasm: ManifoldToplevel,
  track: Track,
  outlines: ShellOutlines,
  profile: EdgeProfile,
): Manifold {
  if (profile.topInset === 0) {
    return track(wasm.Manifold.extrude([outlines.bottom], profile.height));
  }
  const points: Vec3[] = [];
  for (const sample of profile.samples) {
    const ring =
      sample.inset === 0
        ? outlines.bottom
        : sample.inset === profile.topInset
          ? outlines.top
          : (insetOutline(wasm, outlines.bottom, sample.inset) as Point2[]);
    for (const [x, y] of ring) {
      points.push([x, y, sample.z]);
    }
  }
  return track(wasm.Manifold.hull(points));
}

/**
 * Builds the hollow cavity prism. The straight cavity must clear the inward
 * curving wall at its highest point, the cavity ceiling, so the cavity
 * outline is the bottom outline inset by the profile inset at ceiling
 * height plus the wall thickness. Below the ceiling the outer wall only
 * gets wider, so the remaining wall is at least `wall` mm everywhere.
 */
export function buildHollowCavity(
  wasm: ManifoldToplevel,
  track: Track,
  outlines: ShellOutlines,
  profile: EdgeProfile,
  hollow: HollowParams,
): Manifold {
  const ceilingHeight = profile.height - hollow.topThickness;
  const insetAtCeiling = profileInsetAt(profile, ceilingHeight);
  const cavityOutline = insetOutline(wasm, outlines.bottom, insetAtCeiling + hollow.wall);
  const prism = track(wasm.Manifold.extrude([cavityOutline], ceilingHeight + CUT_EPSILON));
  return track(prism.translate(0, 0, -CUT_EPSILON));
}
