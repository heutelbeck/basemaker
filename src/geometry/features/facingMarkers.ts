import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { EdgeProfile } from '../../params/edgeProfile.ts';
import { markerProfilePolygons } from '../../params/facingMarkers.ts';
import type { Point2 } from '../../params/tessellation.ts';
import type { BaseParams } from '../../params/types.ts';
import type { Track } from '../dispose.ts';
import { insetOutline } from '../outlines.ts';
import { buildShellSolid, shellOutlines } from './shell.ts';

const ERROR_MARKERS_MISSING = 'Facing marker cutters require configured facing markers.';

/** Extra radial length so marker prisms punch fully through the wall. */
const RADIAL_OUTSHOOT = 5;

/**
 * One cutter for all configured facing markers. Each marker is a radial
 * prism from the center past the wall, clipped against the band between
 * the wall and a depth-inset copy of the body, so the engraving depth is
 * uniform on every wall profile: straight, sloped, or lipped. The caller
 * subtracts the result from the body.
 */
export function facingMarkerCutter(
  wasm: ManifoldToplevel,
  track: Track,
  params: BaseParams,
  bottomOutline: Point2[],
  profile: EdgeProfile,
): Manifold {
  const facing = params.facingMarkers;
  if (facing === null || facing.markers.length === 0) {
    throw new Error(ERROR_MARKERS_MISSING);
  }
  const innerOutline = insetOutline(wasm, bottomOutline, facing.depth) as Point2[];
  const innerBody = buildShellSolid(
    wasm,
    track,
    shellOutlines(wasm, innerOutline, profile),
    profile,
  );
  const reach = Math.max(...bottomOutline.map(([x, y]) => Math.hypot(x, y))) + RADIAL_OUTSHOOT;
  const prisms = facing.markers.flatMap((marker) =>
    markerProfilePolygons(marker, profile.height).map((polygon) => {
      const section = track(wasm.CrossSection.ofPolygons([polygon], 'Positive'));
      const local = track(wasm.Manifold.extrude(section, reach));
      return track(local.rotate(90, 0, marker.angleDeg + 90));
    }),
  );
  const merged = track(wasm.Manifold.union(prisms));
  return track(merged.subtract(innerBody));
}
