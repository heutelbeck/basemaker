import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { computeEdgeProfile } from '../params/edgeProfile.ts';
import { freeformOutline } from '../params/freeform.ts';
import { resolveShape } from '../params/shapeMetrics.ts';
import { supportPillarCenters } from '../params/supports.ts';
import type { BaseParams } from '../params/types.ts';
import { withGeometryScope } from './dispose.ts';
import { converterInsertCutter } from './features/converter.ts';
import { letteringCutter, letteringSolids } from './features/lettering.ts';
import { magnetHousings, magnetSlotCutters } from './features/magnets.ts';
import { recessCutter } from './features/recess.ts';
import { buildHollowCavity, buildShellSolid, shellOutlines } from './features/shell.ts';
import { slottaCutter, slottaHousing } from './features/slotta.ts';
import type { Point2 } from './tessellation.ts';
import { outlineFor, segmentsFor } from './tessellation.ts';

const ERROR_INVALID_RESULT = 'The generated solid is not a valid manifold: ';
const ERROR_LETTERING_NEEDS_FONT = 'Lettering requires the font to be loaded before building.';

/**
 * Builds the complete base solid from validated parameters. The caller owns
 * the returned manifold and must delete() it when done.
 */
export function buildBase(
  wasm: ManifoldToplevel,
  params: BaseParams,
  font: Font | null = null,
): Manifold {
  if (params.lettering !== null && font === null) {
    throw new Error(ERROR_LETTERING_NEEDS_FONT);
  }
  return withGeometryScope((track) => {
    const outerSpec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
    const tol = params.quality.chordTolMm;
    const bottomOutline =
      outerSpec.kind === 'freeform'
        ? (freeformOutline(outerSpec, tol) as Point2[])
        : outlineFor(resolveShape(outerSpec), tol);
    const profile = computeEdgeProfile(params.height, params.edgeSlope, params.lipRadius, tol);
    const outlines = shellOutlines(wasm, bottomOutline, profile);

    const outer = buildShellSolid(wasm, track, outlines, profile);
    let solid = outer;
    if (params.hollow !== null) {
      const cavity = buildHollowCavity(wasm, track, outlines, profile, params.hollow);
      solid = track(solid.subtract(cavity));
      if (params.magnets !== null) {
        const pillars = magnetHousings(wasm, track, params.magnets, params.height, tol);
        const clipped = track(pillars.intersect(outer));
        solid = track(solid.add(clipped));
      }
      if (params.slotta !== null) {
        const housing = slottaHousing(wasm, track, params.slotta, params.height);
        const clipped = track(housing.intersect(outer));
        solid = track(solid.add(clipped));
      }
      if (params.hollow.supports !== null) {
        const radius = params.hollow.supports.diameter / 2;
        const segments = segmentsFor(radius, tol);
        const pillars = supportPillarCenters(params).map(([x, y]) => {
          const pillar = track(
            wasm.Manifold.cylinder(params.height, radius, radius, segments, false),
          );
          return track(pillar.translate(x, y, 0));
        });
        if (pillars.length > 0) {
          solid = track(solid.add(track(wasm.Manifold.union(pillars))));
        }
      }
    }

    const cutters: Manifold[] = [];
    if (params.magnets !== null) {
      cutters.push(...magnetSlotCutters(wasm, track, params.magnets, tol));
    }
    if (params.recess !== null) {
      cutters.push(recessCutter(wasm, track, outlines.top, params.recess, params.height));
    }
    if (params.slotta !== null) {
      cutters.push(slottaCutter(wasm, track, params.slotta, params.height));
    }
    if (params.shape.kind === 'converter') {
      cutters.push(converterInsertCutter(wasm, track, params.shape, params.height, tol));
    }
    if (params.lettering !== null && font !== null) {
      const cutter = letteringCutter(wasm, track, font, params);
      if (cutter !== null) {
        cutters.push(cutter);
      }
    }
    if (cutters.length > 0) {
      solid = track(wasm.Manifold.difference([solid, ...cutters]));
    }

    const status = solid.status();
    if (status !== 'NoError') {
      throw new Error(`${ERROR_INVALID_RESULT}${status}.`);
    }
    return solid;
  });
}

/**
 * The letter solids matching the lettering of buildBase, for export as a
 * separate colored object. The caller owns the returned manifold. Side
 * placements trim against a lettering-free reference body so the letters
 * meet the curved wall exactly.
 */
export function buildLetterSolids(
  wasm: ManifoldToplevel,
  params: BaseParams,
  font: Font,
): Manifold {
  return withGeometryScope((track) => {
    const reference = track(buildBase(wasm, { ...params, lettering: null }));
    return letteringSolids(wasm, track, font, params, reference);
  });
}

/**
 * The complete printable solid as one body: embossed letters are fused
 * onto the base so single-solid exports such as STL include them.
 */
export function buildBaseSingleSolid(
  wasm: ManifoldToplevel,
  params: BaseParams,
  font: Font | null = null,
): Manifold {
  if (params.lettering === null || params.lettering.style === 'engraved' || font === null) {
    return buildBase(wasm, params, font);
  }
  return withGeometryScope((track) => {
    const body = track(buildBase(wasm, params, font));
    const letters = track(buildLetterSolids(wasm, params, font));
    return track(body.add(letters));
  });
}
