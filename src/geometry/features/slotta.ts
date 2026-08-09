import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { SlottaParams } from '../../params/types.ts';
import { SLOTTA_RIM } from '../../params/types.ts';
import type { Track } from '../dispose.ts';
import { CUT_EPSILON } from './shell.ts';

/** Cutter for the classic slotta tab: a rectangular slot through the base. */
export function slottaCutter(
  wasm: ManifoldToplevel,
  track: Track,
  slotta: SlottaParams,
  height: number,
): Manifold {
  return placedBox(
    wasm,
    track,
    slotta,
    slotta.length,
    slotta.width,
    height + 2 * CUT_EPSILON,
    -CUT_EPSILON,
  );
}

/**
 * Housing for hollow bases: a full-height block around the slot footprint
 * so the slot keeps a rim of at least SLOTTA_RIM inside the cavity.
 * Callers intersect it with the outer solid before adding it.
 */
export function slottaHousing(
  wasm: ManifoldToplevel,
  track: Track,
  slotta: SlottaParams,
  height: number,
): Manifold {
  return placedBox(
    wasm,
    track,
    slotta,
    slotta.length + 2 * SLOTTA_RIM,
    slotta.width + 2 * SLOTTA_RIM,
    height,
    0,
  );
}

function placedBox(
  wasm: ManifoldToplevel,
  track: Track,
  slotta: SlottaParams,
  length: number,
  width: number,
  height: number,
  zBottom: number,
): Manifold {
  const box = track(wasm.Manifold.cube([length, width, height], true));
  const rotated = track(box.rotate(0, 0, slotta.angleDeg));
  return track(rotated.translate(slotta.offsetX, slotta.offsetY, zBottom + height / 2));
}
