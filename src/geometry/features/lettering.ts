import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { topInsetFor } from '../../params/edgeProfile.ts';
import type { BaseParams, LetteringParams } from '../../params/types.ts';
import type { Track } from '../dispose.ts';
import type { GlyphLayout } from '../lettering/textOutlines.ts';
import { glyphVerticalCenter, layoutGlyphsOnArc, textArcContourGroups } from '../lettering/textOutlines.ts';
import { plaqueProud } from './plaque.ts';
import { CUT_EPSILON } from './shell.ts';

const ERROR_LETTERING_SHAPE = 'Lettering is only generated for round bases.';

/** Extra radial length so side cutters punch through the curved wall. */
const SIDE_OUTSHOOT = 2;
/** Radial embedment so embossed side letters bond with the curved wall. */
const SIDE_EMBED = 0.4;

export function letteringBaselineRadius(params: BaseParams): number {
  if (params.shape.kind !== 'round' || params.lettering === null) {
    throw new Error(ERROR_LETTERING_SHAPE);
  }
  const topInset = topInsetFor(params.height, params.edgeSlope, params.lipRadius);
  return params.shape.diameter / 2 - topInset - params.lettering.margin;
}

/** Layout radius and wall geometry for side-placed lettering. */
export function sideWallGeometry(params: BaseParams): {
  radius: number;
  centerZ: number;
  slopeRad: number;
} {
  if (params.shape.kind !== 'round' || params.lettering === null) {
    throw new Error(ERROR_LETTERING_SHAPE);
  }
  const centerZ = params.height / 2;
  return {
    radius: params.shape.diameter / 2 - (params.edgeSlope * centerZ) / params.height,
    centerZ,
    slopeRad: Math.atan2(params.edgeSlope, params.height),
  };
}

function topPrism(
  wasm: ManifoldToplevel,
  track: Track,
  font: Font,
  params: BaseParams,
  lettering: LetteringParams,
  fromZ: number,
  thickness: number,
): Manifold {
  const groups = textArcContourGroups(font, lettering, letteringBaselineRadius(params));
  const sections = groups.map((group) =>
    track(
      wasm.CrossSection.ofPolygons(
        group.map((contour) => contour.points),
        'EvenOdd',
      ),
    ),
  );
  const merged = sections.reduce((union, section) => track(union.add(section)));
  const prism = track(wasm.Manifold.extrude(merged, thickness));
  return track(prism.translate(0, 0, fromZ));
}

/**
 * One radially oriented prism per glyph, lying in the (tilted) wall plane.
 * The glyph plane is tangent to the wall at the glyph's angle; local x runs
 * along the tangent, local y up the wall, and the extrusion direction is
 * the outward wall normal. `radialFrom` is the prism start relative to the
 * wall surface (negative = into the material).
 */
function sideGlyphPrisms(
  wasm: ManifoldToplevel,
  track: Track,
  font: Font,
  params: BaseParams,
  lettering: LetteringParams,
  radialFrom: number,
  thickness: number,
): Manifold {
  const wall = sideWallGeometry(params);
  const slopeDeg = (wall.slopeRad * 180) / Math.PI;
  const sinSlope = Math.sin(wall.slopeRad);
  const cosSlope = Math.cos(wall.slopeRad);
  const layouts: GlyphLayout[] = layoutGlyphsOnArc(font, lettering, wall.radius);
  const verticalCenter = glyphVerticalCenter(layouts);
  const prisms = layouts.map((layout) => {
    const section = track(
      wasm.CrossSection.ofPolygons(
        layout.contours.map((contour) => contour.points),
        'EvenOdd',
      ),
    );
    const local = track(wasm.Manifold.extrude(section, thickness));
    const rotated = track(local.rotate(90 - slopeDeg, 0, (layout.angle * 180) / Math.PI + 90));
    const cos = Math.cos(layout.angle);
    const sin = Math.sin(layout.angle);
    const up = [-sinSlope * cos, -sinSlope * sin, cosSlope];
    const anchor = [
      wall.radius * cos - verticalCenter * up[0] + radialFrom * cos,
      wall.radius * sin - verticalCenter * up[1] + radialFrom * sin,
      wall.centerZ -
        verticalCenter * up[2] +
        (radialFrom - plaqueProud(params)) * Math.tan(wall.slopeRad) +
        0.6 * plaqueProud(params) * Math.sin(wall.slopeRad),
    ];
    return track(rotated.translate(anchor[0], anchor[1], anchor[2]));
  });
  return track(wasm.Manifold.union(prisms));
}

/**
 * Cutter that engraves the text. Letter counters (the hole in an O) are
 * excluded by the even-odd fill, so they remain standing. Returns null for
 * embossed lettering, which removes no material.
 */
export function letteringCutter(
  wasm: ManifoldToplevel,
  track: Track,
  font: Font,
  params: BaseParams,
): Manifold | null {
  const lettering = params.lettering;
  if (lettering === null) {
    throw new Error(ERROR_LETTERING_SHAPE);
  }
  if (lettering.style === 'embossed') {
    return null;
  }
  if (lettering.placement === 'top') {
    return topPrism(
      wasm,
      track,
      font,
      params,
      lettering,
      params.height - lettering.depth,
      lettering.depth + CUT_EPSILON,
    );
  }
  return sideGlyphPrisms(
    wasm,
    track,
    font,
    params,
    lettering,
    plaqueProud(params) - lettering.depth,
    lettering.depth + SIDE_OUTSHOOT,
  );
}

/**
 * The letter solids for the separately colored export part. Engraved
 * letters exactly fill the engraving; embossed letters sit proud of the
 * surface without overlapping the body. `referenceBody` is the base solid
 * without any lettering cut, used to trim against the curved wall.
 */
export function letteringSolids(
  wasm: ManifoldToplevel,
  track: Track,
  font: Font,
  params: BaseParams,
  referenceBody: Manifold,
): Manifold {
  const lettering = params.lettering;
  if (lettering === null) {
    throw new Error(ERROR_LETTERING_SHAPE);
  }
  if (lettering.placement === 'top') {
    const fromZ = lettering.style === 'engraved' ? params.height - lettering.depth : params.height;
    return topPrism(wasm, track, font, params, lettering, fromZ, lettering.depth);
  }
  if (lettering.style === 'engraved') {
    const prisms = sideGlyphPrisms(
      wasm,
      track,
      font,
      params,
      lettering,
      plaqueProud(params) - lettering.depth,
      lettering.depth + SIDE_OUTSHOOT,
    );
    return track(prisms.intersect(referenceBody));
  }
  const prisms = sideGlyphPrisms(
    wasm,
    track,
    font,
    params,
    lettering,
    plaqueProud(params) - SIDE_EMBED,
    lettering.depth + SIDE_EMBED,
  );
  return track(prisms.subtract(referenceBody));
}
