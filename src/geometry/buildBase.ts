import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { computeEdgeProfile } from '../params/edgeProfile.ts';
import { magnetCenters } from '../params/magnetLayout.ts';
import { freeformOutline } from '../params/freeform.ts';
import { resolveShape } from '../params/shapeMetrics.ts';
import { supportPillarCenters } from '../params/supports.ts';
import type { BaseParams, PlaqueParams } from '../params/types.ts';
import { configuredPlaques, plaqueVariants } from '../params/types.ts';
import { fontFor } from './lettering/font.ts';
import { withGeometryScope } from './dispose.ts';
import { converterInsertCutter } from './features/converter.ts';
import { letteringCutter, letteringSolids } from './features/lettering.ts';
import { magnetHousings, magnetSlotCutters } from './features/magnets.ts';
import { recessCutter } from './features/recess.ts';
import { buildHollowCavity, buildShellSolid, hollowInnerOutline, shellOutlines } from './features/shell.ts';
import { slottaCutter, slottaHousing } from './features/slotta.ts';
import { plaqueSolid } from './features/plaque.ts';
import { surfaceRelief } from './features/surface/index.ts';
import type { Point2 } from '../params/tessellation.ts';
import { outlineFor, segmentsFor } from '../params/tessellation.ts';

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
    const magnetLayoutCenters = params.magnets !== null ? magnetCenters(params) : [];
    let solid = outer;
    if (params.hollow !== null) {
      const cavity = buildHollowCavity(wasm, track, outlines, profile, params.hollow);
      solid = track(solid.subtract(cavity));
      if (params.magnets !== null) {
        const pillars = magnetHousings(wasm, track, params.magnets, magnetLayoutCenters, params.height, tol);
        const clipped = track(pillars.intersect(outer));
        solid = track(solid.add(clipped));
      }
      if (params.slotta !== null) {
        const housing = slottaHousing(wasm, track, params.slotta, params.height);
        const clipped = track(housing.intersect(outer));
        solid = track(solid.add(clipped));
      }
      if (params.hollow.supports !== null) {
        if (params.hollow.supports.style === 'grid') {
          const thickness = params.hollow.supports.diameter;
          const spacing = params.hollow.supports.spacing;
          const inner = hollowInnerOutline(wasm, outlines, profile, params.hollow, 0);
          const span = Math.max(...inner.map(([x, y]) => Math.hypot(x, y))) + spacing;
          const ribs: Manifold[] = [];
          const steps = Math.floor(span / spacing);
          for (let i = -steps; i <= steps; i++) {
            const xRib = track(wasm.Manifold.cube([thickness, span * 2, params.height], true));
            ribs.push(track(xRib.translate(i * spacing, 0, params.height / 2)));
            const yRib = track(wasm.Manifold.cube([span * 2, thickness, params.height], true));
            ribs.push(track(yRib.translate(0, i * spacing, params.height / 2)));
          }
          const lattice = track(wasm.Manifold.union(ribs));
          solid = track(solid.add(track(lattice.intersect(cavity))));
        } else {
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
    }

    const variants = plaqueVariants(params);
    for (const variant of variants) {
      solid = track(solid.add(plaqueSolid(wasm, track, variant, bottomOutline)));
    }

    const cutters: Manifold[] = [];
    if (params.surface !== null) {
      const relief = surfaceRelief(wasm, track, params.surface, outlines.top, params.height, tol);
      if (relief.add !== null) {
        solid = track(solid.add(relief.add));
      }
      if (relief.cut !== null) {
        cutters.push(relief.cut);
      }
    }
    if (params.magnets !== null) {
      cutters.push(...magnetSlotCutters(wasm, track, params.magnets, magnetLayoutCenters, tol));
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
    for (const variant of variants) {
      if (variant.lettering === null) {
        continue;
      }
      const plaqueFont = fontFor(variant.lettering.font);
      if (plaqueFont === null) {
        throw new Error(ERROR_LETTERING_NEEDS_FONT);
      }
      const cutter = letteringCutter(wasm, track, plaqueFont, variant);
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

export interface PlaquePart {
  plaque: PlaqueParams;
  solid: Manifold;
  letters: Manifold | null;
}

/**
 * One printable part per configured plaque for multi-part exports: the
 * plaque solid with its own text cut in where the style engraves, plus
 * the letter solids that fill the engraving (or stand on the face) as a
 * separately colored part. The caller owns every returned manifold.
 */
export function buildPlaqueParts(wasm: ManifoldToplevel, params: BaseParams): PlaquePart[] {
  return withGeometryScope((track) => {
    const plaques = configuredPlaques(params);
    const variants = plaqueVariants(params);
    if (variants.length === 0) {
      return [];
    }
    const outline = baseBottomOutline(params);
    const needsReference = variants.some(
      (variant) => variant.lettering !== null && variant.lettering.style !== 'recessed',
    );
    const reference = needsReference
      ? track(buildBase(wasm, letterReferenceParams(params)))
      : null;
    return variants.map((variant, index) => {
      const raw = plaqueSolid(wasm, track, variant, outline);
      let solid = raw;
      let letters: Manifold | null = null;
      if (variant.lettering !== null) {
        const plaqueFont = fontFor(variant.lettering.font);
        if (plaqueFont === null) {
          throw new Error(ERROR_LETTERING_NEEDS_FONT);
        }
        const cutter = letteringCutter(wasm, track, plaqueFont, variant);
        if (cutter !== null) {
          solid = track(raw.subtract(cutter));
        }
        if (variant.lettering.style !== 'recessed' && reference !== null) {
          letters = letteringSolids(wasm, track, plaqueFont, variant, reference);
        }
      }
      return {
        plaque: plaques[index],
        solid: solid.translate(0, 0, 0),
        letters: letters === null ? null : letters.translate(0, 0, 0),
      };
    });
  });
}

/**
 * The parameters of the letter-free reference body that letter solids
 * are trimmed against: all engravings stripped (rim lettering and every
 * plaque text), all plaque solids kept, so letters meet the uncut
 * surface exactly.
 */
function letterReferenceParams(params: BaseParams): BaseParams {
  return {
    ...params,
    lettering: null,
    plaque: params.plaque === null ? null : { ...params.plaque, text: null },
    plaqueBack:
      (params.plaqueBack ?? null) === null || params.plaqueBack === null
        ? null
        : { ...params.plaqueBack, text: null },
  };
}

/** The footprint outline of the base's outer shape at its quality tolerance. */
export function baseBottomOutline(params: BaseParams): Point2[] {
  const outerSpec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
  const tol = params.quality.chordTolMm;
  return outerSpec.kind === 'freeform'
    ? (freeformOutline(outerSpec, tol))
    : outlineFor(resolveShape(outerSpec), tol);
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
    const reference = track(buildBase(wasm, letterReferenceParams(params)));
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
  const rimEmbossed =
    params.lettering !== null && params.lettering.style === 'embossed' && font !== null;
  const plaqueEmbossed = plaqueVariants(params).some(
    (variant) => variant.lettering !== null && variant.lettering.style === 'embossed',
  );
  if (!rimEmbossed && !plaqueEmbossed) {
    return buildBase(wasm, params, font);
  }
  return withGeometryScope((track) => {
    let body = track(buildBase(wasm, params, font));
    if (rimEmbossed && font !== null) {
      body = track(body.add(track(buildLetterSolids(wasm, params, font))));
    }
    if (plaqueEmbossed) {
      for (const part of buildPlaqueParts(wasm, params)) {
        part.solid.delete();
        if (part.letters !== null && part.plaque.text?.style === 'embossed') {
          body = track(body.add(track(part.letters)));
        } else {
          part.letters?.delete();
        }
      }
    }
    return body;
  });
}
