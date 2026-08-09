import type { ManifoldToplevel } from 'manifold-3d';
import type { SurfaceParams } from '../../../params/surface.ts';
import type { Point2 } from '../../../params/tessellation.ts';
import type { Track } from '../../dispose.ts';
import { basinPlansForCraters, basinPlansForPonds, buildBasins } from './basins.ts';
import { buildCobblestones } from './cobblestone.ts';
import { buildLava } from './lava.ts';
import { buildPlanks } from './planks.ts';
import type { SurfaceRelief } from './shared.ts';
import { topFaceOf } from './shared.ts';
import { buildSteelPlates } from './steel.ts';

export type { SurfaceRelief } from './shared.ts';

/**
 * Builds the relief solids for a surface texture on the top face at
 * `height`. Raised parts return in `add` embedded slightly into the face;
 * engraved parts return in `cut` overshooting above it. Pond and crater
 * types return both: a sculpted rim plus the sculpted bowl.
 */
export function surfaceRelief(
  wasm: ManifoldToplevel,
  track: Track,
  surface: SurfaceParams,
  topOutline: Point2[],
  height: number,
  tolMm: number,
): SurfaceRelief {
  const face = topFaceOf(topOutline);
  switch (surface.type) {
    case 'cobblestone':
      return buildCobblestones(wasm, track, surface, face, height, tolMm);
    case 'planks':
      return buildPlanks(wasm, track, surface, face, height);
    case 'pond':
      return buildBasins(wasm, track, basinPlansForPonds(surface, face), face, height);
    case 'craters':
      return buildBasins(wasm, track, basinPlansForCraters(surface, face), face, height);
    case 'lava':
      return buildLava(wasm, track, surface, face, height);
    case 'steelPlates':
      return buildSteelPlates(wasm, track, surface, face, height);
  }
}
