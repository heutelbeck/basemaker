import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { RecessParams } from '../../params/types.ts';
import type { Track } from '../dispose.ts';
import { insetOutline } from '../outlines.ts';
import type { Point2 } from '../tessellation.ts';
import { CUT_EPSILON } from './shell.ts';

/** Cutter for the recessed top: the top outline inset, cut down from above. */
export function recessCutter(
  wasm: ManifoldToplevel,
  track: Track,
  topOutline: Point2[],
  recess: RecessParams,
  height: number,
): Manifold {
  const outline = insetOutline(wasm, topOutline, recess.inset);
  const prism = track(wasm.Manifold.extrude([outline], recess.depth + CUT_EPSILON));
  return track(prism.translate(0, 0, height - recess.depth));
}
