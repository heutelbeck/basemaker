import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { MagnetParams } from '../../params/types.ts';
import { magnetPositions } from '../../params/validate.ts';
import type { Track } from '../dispose.ts';
import { segmentsFor } from '../tessellation.ts';
import { CUT_EPSILON } from './shell.ts';

/**
 * Slot cutters, one per magnet, cutting upward from the underside so a
 * magnet can be glued in flush with the bottom face.
 */
export function magnetSlotCutters(
  wasm: ManifoldToplevel,
  track: Track,
  magnets: MagnetParams,
  tolMm: number,
): Manifold[] {
  return placements(magnets).map(([x, y]) => {
    const slot =
      magnets.shape === 'round'
        ? track(
            wasm.Manifold.cylinder(
              magnets.depth + CUT_EPSILON,
              magnets.diameter / 2,
              magnets.diameter / 2,
              segmentsFor(magnets.diameter / 2, tolMm),
              false,
            ),
          )
        : track(
            wasm.Manifold.cube([magnets.length, magnets.width, magnets.depth + CUT_EPSILON], true),
          );
    const zShift =
      magnets.shape === 'round' ? -CUT_EPSILON : (magnets.depth + CUT_EPSILON) / 2 - CUT_EPSILON;
    return track(slot.translate(x, y, zShift));
  });
}

/**
 * Housing pillars for hollow bases: full-height columns of slot size plus
 * padding, so each magnet slot is surrounded by material inside the cavity.
 * Callers intersect the union with the outer solid so pillars near the rim
 * cannot poke through the sloped wall.
 */
export function magnetHousings(
  wasm: ManifoldToplevel,
  track: Track,
  magnets: MagnetParams,
  height: number,
  tolMm: number,
): Manifold {
  const pillars = placements(magnets).map(([x, y]) => {
    let pillar: Manifold;
    if (magnets.shape === 'round') {
      const radius = magnets.diameter / 2 + magnets.padding;
      pillar = track(
        wasm.Manifold.cylinder(height, radius, radius, segmentsFor(radius, tolMm), false),
      );
    } else {
      const box = track(
        wasm.Manifold.cube(
          [magnets.length + 2 * magnets.padding, magnets.width + 2 * magnets.padding, height],
          true,
        ),
      );
      pillar = track(box.translate(0, 0, height / 2));
    }
    return track(pillar.translate(x, y, 0));
  });
  return track(wasm.Manifold.union(pillars));
}

function placements(magnets: MagnetParams): [number, number][] {
  return magnetPositions(magnets.count, magnets.spacing, magnets.offsetX).map((x) => [
    x,
    magnets.offsetY,
  ]);
}
