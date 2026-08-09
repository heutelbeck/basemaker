import type { Font } from 'opentype.js';
import type { Drawing, Shape3D, Sketch } from 'replicad';
import { draw, drawCircle, drawEllipse, drawRectangle, drawRoundedRectangle } from 'replicad';
import { letteringBaselineRadius, sideWallGeometry } from '../features/lettering.ts';
import { layoutGlyphsOnArc, textArcContours } from '../lettering/textOutlines.ts';
import { freeformOutline } from '../../params/freeform.ts';
import type { Vec } from '../../params/polygon.ts';
import type { ResolvedShape } from '../../params/shapeMetrics.ts';
import { resolveShape } from '../../params/shapeMetrics.ts';
import { topInsetFor } from '../../params/edgeProfile.ts';
import { supportPillarCenters } from '../../params/supports.ts';
import type { BaseParams, MagnetParams } from '../../params/types.ts';
import { SLOTTA_RIM } from '../../params/types.ts';
import { magnetPositions } from '../../params/validate.ts';
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
      for (const pillar of magnetDrawings(params.magnets, params.magnets.padding)) {
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
      const radius = params.hollow.supports.diameter / 2;
      for (const [x, y] of supportPillarCenters(params)) {
        const pillar = asShape3D(
          drawCircle(radius).translate(x, y).sketchOnPlane('XY').extrude(params.height),
        );
        solid = asShape3D(solid.fuse(pillar));
      }
    }
  }

  if (params.magnets !== null) {
    for (const slot of magnetDrawings(params.magnets, 0)) {
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
 * Applies lettering to the B-rep solid. Engraved outers are cut and their
 * counters restored as islands; embossed outers are fused and their
 * counters cut back out above the surface. Side placement builds each
 * glyph prism flat and transforms it onto the (possibly sloped) wall.
 */
function applyStepLettering(solid: Shape3D, params: BaseParams, font: Font): Shape3D {
  const lettering = params.lettering;
  if (lettering === null) {
    return solid;
  }
  const reference = solid.clone();
  let result = solid;
  if (lettering.placement === 'top') {
    const fromZ = lettering.style === 'engraved' ? params.height - lettering.depth : params.height;
    const contours = textArcContours(font, lettering, letteringBaselineRadius(params));
    for (const contour of contours.filter((candidate) => !candidate.isHole)) {
      const prism = asShape3D(
        polylineDrawing(contour.points)
          .sketchOnPlane('XY', fromZ)
          .extrude(lettering.depth + (lettering.style === 'engraved' ? CUT_EPSILON : 0)),
      );
      result = asShape3D(lettering.style === 'engraved' ? result.cut(prism) : result.fuse(prism));
    }
    for (const contour of contours.filter((candidate) => candidate.isHole)) {
      const prism = asShape3D(
        polylineDrawing(contour.points)
          .sketchOnPlane('XY', fromZ)
          .extrude(lettering.depth + (lettering.style === 'engraved' ? 0 : CUT_EPSILON)),
      );
      result = asShape3D(lettering.style === 'engraved' ? result.fuse(prism) : result.cut(prism));
    }
    return result;
  }
  const wall = sideWallGeometry(params);
  const slopeDeg = (wall.slopeRad * 180) / Math.PI;
  const sinSlope = Math.sin(wall.slopeRad);
  const cosSlope = Math.cos(wall.slopeRad);
  const engraved = lettering.style === 'engraved';
  const radialFrom = engraved ? -lettering.depth : -0.4;
  const thickness = engraved ? lettering.depth + 2 : lettering.depth + 0.4;
  for (const layout of layoutGlyphsOnArc(font, lettering, wall.radius)) {
    const angleDeg = (layout.angle * 180) / Math.PI;
    const cos = Math.cos(layout.angle);
    const sin = Math.sin(layout.angle);
    const up = [-sinSlope * cos, -sinSlope * sin, cosSlope];
    const normal = [cosSlope * cos, cosSlope * sin, sinSlope];
    const halfSize = lettering.sizeMm / 2;
    const anchor: [number, number, number] = [
      wall.radius * cos - halfSize * up[0] + radialFrom * normal[0],
      wall.radius * sin - halfSize * up[1] + radialFrom * normal[1],
      wall.centerZ - halfSize * up[2] + radialFrom * normal[2],
    ];
    const place = (drawingPoints: [number, number][], extrudeBy: number) =>
      asShape3D(
        asShape3D(
          asShape3D(polylineDrawing(drawingPoints).sketchOnPlane('XY').extrude(extrudeBy))
            .rotate(90 - slopeDeg, [0, 0, 0], [1, 0, 0])
            .rotate(angleDeg + 90, [0, 0, 0], [0, 0, 1]),
        ).translate(anchor),
      );
    for (const contour of layout.contours.filter((candidate) => !candidate.isHole)) {
      const prism = place(contour.points, thickness);
      result = asShape3D(engraved ? result.cut(prism) : result.fuse(prism));
    }
    for (const contour of layout.contours.filter((candidate) => candidate.isHole)) {
      const prism = place(contour.points, thickness);
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
  }
}

function magnetDrawings(magnets: MagnetParams, grow: number): Drawing[] {
  return magnetPositions(magnets.count, magnets.spacing, magnets.offsetX).map((x) => {
    const drawing =
      magnets.shape === 'round'
        ? drawCircle(magnets.diameter / 2 + grow)
        : drawRectangle(magnets.length + 2 * grow, magnets.width + 2 * grow);
    return drawing.translate(x, magnets.offsetY);
  });
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
