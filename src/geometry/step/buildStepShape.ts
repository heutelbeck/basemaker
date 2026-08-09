import type { Font } from 'opentype.js';
import type { Drawing, Shape3D, Sketch } from 'replicad';
import { draw, drawCircle, drawEllipse, drawRectangle, drawRoundedRectangle } from 'replicad';
import { letteringBaselineRadius, sideWallGeometry } from '../features/lettering.ts';
import { glyphVerticalCenter, layoutGlyphsOnArc, textArcContourGroups } from '../lettering/textOutlines.ts';
import { freeformOutline } from '../../params/freeform.ts';
import { hexOutline } from '../../params/tessellation.ts';
import type { Vec } from '../../params/polygon.ts';
import type { ResolvedShape } from '../../params/shapeMetrics.ts';
import { resolveShape } from '../../params/shapeMetrics.ts';
import { topInsetFor } from '../../params/edgeProfile.ts';
import { supportPillarCenters } from '../../params/supports.ts';
import type { BaseParams, MagnetParams } from '../../params/types.ts';
import { SLOTTA_RIM } from '../../params/types.ts';
import { magnetCenters } from '../../params/magnetLayout.ts';
import { plaqueProud } from '../features/plaque.ts';
import { CUT_EPSILON } from '../features/shell.ts';

const ERROR_UNEXPECTED_SHAPE = 'The B-rep boolean produced an unexpected non-solid result.';

/**
 * Builds the base as an OCCT B-rep solid with true analytic curves via
 * replicad. Callers must have initialized replicad with setOC() first.
 * The result's curved faces are cones/cylinders/offset curves, so STEP
 * exports carry real radius data instead of tessellation.
 */
export function buildStepShape(params: BaseParams, font: Font | null = null): Shape3D {
  const outerSpec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
  const bottom =
    outerSpec.kind === 'freeform'
      ? polylineDrawing(freeformOutline(outerSpec, params.quality.chordTolMm))
      : footprintDrawing(resolveShape(outerSpec));
  const loftTop = params.edgeSlope > 0 ? bottom.offset(-params.edgeSlope) : bottom;
  const topInset = topInsetFor(params.height, params.edgeSlope, params.lipRadius);
  const top = topInset > 0 ? bottom.offset(-topInset) : bottom;

  const bottomSketch = bottom.sketchOnPlane('XY') as Sketch;
  let solid = asShape3D(
    params.edgeSlope > 0
      ? bottomSketch.loftWith(loftTop.sketchOnPlane('XY', params.height) as Sketch, { ruled: true })
      : bottomSketch.extrude(params.height),
  );
  if (params.lipRadius > 0) {
    solid = asShape3D(solid.fillet(params.lipRadius, (edge) => edge.inPlane('XY', params.height)));
  }
  const needsHousings =
    params.hollow !== null && (params.magnets !== null || params.slotta !== null);
  const outerBody = needsHousings ? solid.clone() : null;

  if (params.hollow !== null) {
    const ceiling = params.height - params.hollow.topThickness;
    const slopeInsetAtCeiling = (params.edgeSlope * ceiling) / params.height;
    const cavity = asShape3D(
      bottom
        .offset(-(slopeInsetAtCeiling + params.hollow.wall))
        .sketchOnPlane('XY', -CUT_EPSILON)
        .extrude(ceiling + CUT_EPSILON),
    );
    solid = asShape3D(solid.cut(cavity));
    if (params.magnets !== null && outerBody !== null) {
      for (const pillar of magnetDrawings(params, params.magnets, params.magnets.padding)) {
        const column = asShape3D(pillar.sketchOnPlane('XY').extrude(params.height));
        const clipped = asShape3D(column.intersect(outerBody.clone()));
        solid = asShape3D(solid.fuse(clipped));
      }
    }
    if (params.slotta !== null && outerBody !== null) {
      const housing = asShape3D(
        drawRectangle(params.slotta.length + 2 * SLOTTA_RIM, params.slotta.width + 2 * SLOTTA_RIM)
          .rotate(params.slotta.angleDeg)
          .translate(params.slotta.offsetX, params.slotta.offsetY)
          .sketchOnPlane('XY')
          .extrude(params.height),
      );
      const clipped = asShape3D(housing.intersect(outerBody.clone()));
      solid = asShape3D(solid.fuse(clipped));
    }
    if (params.hollow.supports !== null) {
      if (params.hollow.supports.style === 'grid') {
        const thickness = params.hollow.supports.diameter;
        const spacing = params.hollow.supports.spacing;
        const ceiling = params.height - params.hollow.topThickness;
        const innerInset = (params.edgeSlope * ceiling) / params.height + params.hollow.wall + 1;
        const inner = bottom.offset(-innerInset);
        const span = Math.max(params.height, topInset) + 200;
        const steps = Math.floor(span / spacing);
        for (let i = -steps; i <= steps; i++) {
          for (const vertical of [true, false]) {
            const rib = vertical
              ? drawRectangle(thickness, span * 2).translate(i * spacing, 0)
              : drawRectangle(span * 2, thickness).translate(0, i * spacing);
            const clipped = rib.intersect(inner);
            try {
              const solidRib = asShape3D(clipped.sketchOnPlane('XY').extrude(params.height));
              solid = asShape3D(solid.fuse(solidRib));
            } catch {
              // A rib entirely outside the cavity produces an empty
              // drawing whose sketch throws; skipping it is correct.
              continue;
            }
          }
        }
      } else {
        const radius = params.hollow.supports.diameter / 2;
        for (const [x, y] of supportPillarCenters(params)) {
          const pillar = asShape3D(
            drawCircle(radius).translate(x, y).sketchOnPlane('XY').extrude(params.height),
          );
          solid = asShape3D(solid.fuse(pillar));
        }
      }
    }
  }

  if (params.magnets !== null) {
    for (const slot of magnetDrawings(params, params.magnets, 0)) {
      const cutter = asShape3D(
        slot.sketchOnPlane('XY', -CUT_EPSILON).extrude(params.magnets.depth + CUT_EPSILON),
      );
      solid = asShape3D(solid.cut(cutter));
    }
  }

  if (params.recess !== null) {
    const cutter = asShape3D(
      top
        .offset(params.recess.inset > 0 ? -params.recess.inset : 0)
        .sketchOnPlane('XY', params.height - params.recess.depth)
        .extrude(params.recess.depth + CUT_EPSILON),
    );
    solid = asShape3D(solid.cut(cutter));
  }

  if (params.slotta !== null) {
    const cutter = asShape3D(
      drawRectangle(params.slotta.length, params.slotta.width)
        .rotate(params.slotta.angleDeg)
        .translate(params.slotta.offsetX, params.slotta.offsetY)
        .sketchOnPlane('XY', -CUT_EPSILON)
        .extrude(params.height + 2 * CUT_EPSILON),
    );
    solid = asShape3D(solid.cut(cutter));
  }

  if (params.shape.kind === 'converter') {
    const converter = params.shape;
    const insert = footprintDrawing(resolveShape(converter.insert));
    const grown = converter.clearance > 0 ? insert.offset(converter.clearance) : insert;
    const cutter = asShape3D(
      grown
        .sketchOnPlane('XY', params.height - converter.insertDepth)
        .extrude(converter.insertDepth + CUT_EPSILON),
    );
    solid = asShape3D(solid.cut(cutter));
  }

  if (params.lettering !== null && font !== null) {
    solid = applyStepLettering(solid, params, font);
  }

  return solid;
}

/**
 * Places a glyph prism onto the (possibly sloped) side wall: extrudes the
 * flat drawing, tilts it into the wall plane, and anchors it at the
 * glyph's arc angle, starting `radialFrom` relative to the wall surface.
 */
function sideGlyphPlacer(
  params: BaseParams,
  radialFrom: number,
  verticalCenter: number,
): (layout: {
  angle: number;
}) => (drawingPoints: [number, number][], extrudeBy: number, boostMm?: number) => Shape3D {
  const wall = sideWallGeometry(params);
  const slopeDeg = (wall.slopeRad * 180) / Math.PI;
  const sinSlope = Math.sin(wall.slopeRad);
  const cosSlope = Math.cos(wall.slopeRad);
  return (layout) => {
    const angleDeg = (layout.angle * 180) / Math.PI;
    const cos = Math.cos(layout.angle);
    const sin = Math.sin(layout.angle);
    const up = [-sinSlope * cos, -sinSlope * sin, cosSlope];
    const anchor: [number, number, number] = [
      wall.radius * cos - verticalCenter * up[0] + radialFrom * cos,
      wall.radius * sin - verticalCenter * up[1] + radialFrom * sin,
      wall.centerZ -
        verticalCenter * up[2] +
        (radialFrom - plaqueProud(params)) * Math.tan(wall.slopeRad) +
        0.6 * plaqueProud(params) * Math.sin(wall.slopeRad),
    ];
    return (drawingPoints, extrudeBy, boostMm = 0) =>
      asShape3D(
        asShape3D(
          asShape3D(letterDrawing(drawingPoints, boostMm).sketchOnPlane('XY').extrude(extrudeBy))
            .rotate(90 - slopeDeg, [0, 0, 0], [1, 0, 0])
            .rotate(angleDeg + 90, [0, 0, 0], [0, 0, 1]),
        ).translate(anchor),
      );
  };
}

/**
 * The letter solids alone as one B-rep shape, matching what
 * applyStepLettering carves or raises, so STEP exports can carry the
 * letters as a separately colorable part with true smooth curves.
 */
export function buildStepLetterParts(
  params: BaseParams,
  font: Font,
  reference: Shape3D | null = null,
): Shape3D | null {
  const lettering = params.lettering;
  if (lettering === null || lettering.style === 'recessed') {
    return null;
  }
  let letters: Shape3D | null = null;
  const addGlyph = (solid: Shape3D) => {
    letters = letters === null ? solid : asShape3D(letters.fuse(solid));
  };
  if (lettering.placement === 'top') {
    const fromZ = lettering.style === 'embossed' ? params.height : params.height - lettering.depth;
    for (const group of textArcContourGroups(font, lettering, letteringBaselineRadius(params))) {
      let glyph: Shape3D | null = null;
      for (const contour of group.filter((candidate) => !candidate.isHole)) {
        const prism = asShape3D(
          letterDrawing(contour.points, lettering.strokeBoostMm)
            .sketchOnPlane('XY', fromZ)
            .extrude(lettering.depth),
        );
        glyph = glyph === null ? prism : asShape3D(glyph.fuse(prism));
      }
      if (glyph === null) {
        continue;
      }
      for (const contour of group.filter((candidate) => candidate.isHole)) {
        const prism = asShape3D(
          letterDrawing(contour.points, -lettering.strokeBoostMm)
            .sketchOnPlane('XY', fromZ - CUT_EPSILON)
            .extrude(lettering.depth + 2 * CUT_EPSILON),
        );
        glyph = asShape3D(glyph.cut(prism));
      }
      addGlyph(glyph);
    }
    return letters;
  }
  const clipReference = reference ?? buildStepShape({ ...params, lettering: null });
  const engraved = lettering.style !== 'embossed';
  const radialFrom = plaqueProud(params) + (engraved ? -lettering.depth : -0.4);
  const thickness = engraved ? lettering.depth + 2 : lettering.depth + 0.4;
  const sideLayouts = layoutGlyphsOnArc(font, lettering, sideWallGeometry(params).radius);
  const placerFor = sideGlyphPlacer(params, radialFrom, glyphVerticalCenter(sideLayouts));
  for (const layout of sideLayouts) {
    const place = placerFor(layout);
    let glyph: Shape3D | null = null;
    for (const contour of layout.contours.filter((candidate) => !candidate.isHole)) {
      const prism = place(contour.points, thickness, lettering.strokeBoostMm);
      glyph = glyph === null ? prism : asShape3D(glyph.fuse(prism));
    }
    if (glyph === null) {
      continue;
    }
    for (const contour of layout.contours.filter((candidate) => candidate.isHole)) {
      const prism = place(contour.points, thickness + 2 * CUT_EPSILON, -lettering.strokeBoostMm);
      glyph = asShape3D(glyph.cut(prism));
    }
    addGlyph(
      engraved
        ? asShape3D(glyph.intersect(clipReference.clone()))
        : asShape3D(glyph.cut(clipReference.clone())),
    );
  }
  return letters;
}

/**
 * Applies lettering to the B-rep solid. Engraved outers are cut and their
 * counters restored as islands; embossed outers are fused and their
 * counters cut back out above the surface. Side placement builds each
 * glyph prism flat and transforms it onto the (possibly sloped) wall.
 */
export function applyStepLettering(solid: Shape3D, params: BaseParams, font: Font): Shape3D {
  const lettering = params.lettering;
  if (lettering === null) {
    return solid;
  }
  const reference = solid.clone();
  let result = solid;
  if (lettering.placement === 'top') {
    const fromZ = lettering.style === 'embossed' ? params.height : params.height - lettering.depth;
    const groups = textArcContourGroups(font, lettering, letteringBaselineRadius(params));
    for (const group of groups) {
      for (const contour of group.filter((candidate) => !candidate.isHole)) {
        const prism = asShape3D(
          letterDrawing(contour.points, lettering.strokeBoostMm)
            .sketchOnPlane('XY', fromZ)
            .extrude(lettering.depth + (lettering.style === 'embossed' ? 0 : CUT_EPSILON)),
        );
        result = asShape3D(lettering.style === 'embossed' ? result.fuse(prism) : result.cut(prism));
      }
      for (const contour of group.filter((candidate) => candidate.isHole)) {
        const prism = asShape3D(
          letterDrawing(contour.points, -lettering.strokeBoostMm)
            .sketchOnPlane('XY', fromZ)
            .extrude(lettering.depth + (lettering.style === 'embossed' ? CUT_EPSILON : 0)),
        );
        result = asShape3D(lettering.style === 'embossed' ? result.cut(prism) : result.fuse(prism));
      }
    }
    return result;
  }
  const engraved = lettering.style !== 'embossed';
  const radialFrom = plaqueProud(params) + (engraved ? -lettering.depth : -0.4);
  const thickness = engraved ? lettering.depth + 2 : lettering.depth + 0.4;
  const applyLayouts = layoutGlyphsOnArc(font, lettering, sideWallGeometry(params).radius);
  const placerFor = sideGlyphPlacer(params, radialFrom, glyphVerticalCenter(applyLayouts));
  for (const layout of applyLayouts) {
    const place = placerFor(layout);
    for (const contour of layout.contours.filter((candidate) => !candidate.isHole)) {
      const prism = place(contour.points, thickness, lettering.strokeBoostMm);
      result = asShape3D(engraved ? result.cut(prism) : result.fuse(prism));
    }
    for (const contour of layout.contours.filter((candidate) => candidate.isHole)) {
      const prism = place(contour.points, thickness, -lettering.strokeBoostMm);
      if (engraved) {
        const island = asShape3D(prism.intersect(reference.clone()));
        result = asShape3D(result.fuse(island));
      } else {
        const outside = asShape3D(prism.cut(reference.clone()));
        result = asShape3D(result.cut(outside));
      }
    }
  }
  return result;
}

export function footprintDrawing(shape: ResolvedShape): Drawing {
  switch (shape.type) {
    case 'circle':
      return drawCircle(shape.r);
    case 'ellipse':
      return drawEllipse(shape.a, shape.b);
    case 'stadium':
      return drawRoundedRectangle(2 * (shape.flank + shape.r), 2 * shape.r, shape.r);
    case 'rect':
      return drawRectangle(2 * shape.hx, 2 * shape.hy);
    case 'hex':
      return polylineDrawing(hexOutline(shape.acrossFlats));
  }
}

function magnetDrawings(params: BaseParams, magnets: MagnetParams, grow: number): Drawing[] {
  return magnetCenters(params).map(([x, y]) => {
    const drawing =
      magnets.shape === 'round'
        ? drawCircle(magnets.diameter / 2 + grow)
        : drawRectangle(magnets.length + 2 * grow, magnets.width + 2 * grow);
    return drawing.translate(x, y);
  });
}

/** Glyph contour drawing with the stroke boost applied per side. */
function letterDrawing(points: [number, number][], boostMm: number): Drawing {
  const drawing = polylineDrawing(points);
  return Number.isFinite(boostMm) && boostMm !== 0 ? drawing.offset(boostMm) : drawing;
}

/**
 * Closed straight-segment drawing through the given outline points.
 * Consecutive duplicates are dropped because zero-length edges make the
 * OCCT wire builder throw.
 */
export function polylineDrawing(outline: Vec[]): Drawing {
  const epsilon = 1e-6;
  const cleaned: Vec[] = [];
  for (const point of outline) {
    const previous = cleaned[cleaned.length - 1];
    if (
      previous === undefined ||
      Math.abs(previous[0] - point[0]) > epsilon ||
      Math.abs(previous[1] - point[1]) > epsilon
    ) {
      cleaned.push(point);
    }
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (
    cleaned.length > 1 &&
    Math.abs(first[0] - last[0]) <= epsilon &&
    Math.abs(first[1] - last[1]) <= epsilon
  ) {
    cleaned.pop();
  }
  let pen = draw(cleaned[0]);
  for (let i = 1; i < cleaned.length; i++) {
    pen = pen.lineTo(cleaned[i]);
  }
  return pen.close();
}

export function asShape3D(shape: unknown): Shape3D {
  const candidate = shape as Shape3D & { wrapped?: unknown };
  if (candidate === null || typeof candidate !== 'object' || candidate.wrapped === undefined) {
    throw new Error(ERROR_UNEXPECTED_SHAPE);
  }
  return candidate;
}
