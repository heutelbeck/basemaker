import { lipArcReachesTop, topInsetFor } from './edgeProfile.ts';
import { magnetCenters } from './magnetLayout.ts';
import { validateSurface } from './surface.ts';
import { freeformOutline } from './freeform.ts';
import type { Vec } from './polygon.ts';
import {
  distanceToBoundary,
  isConvex,
  isSimplePolygon,
  polygonArea,
  polygonContains,
} from './polygon.ts';
import type { ResolvedShape } from './shapeMetrics.ts';
import { inradius, pointInShape, resolveShape } from './shapeMetrics.ts';
import type { BaseParams, FreeformSpec, MagnetParams, ShapeSpec, SlottaParams } from './types.ts';
import { APPROX_ADVANCE_RATIO, SLOTTA_RIM, configuredPlaques } from './types.ts';

export interface ValidationIssue {
  code: string;
  message: string;
}

const MIN_RIM = 1;
/**
 * Slotta slots on original GW bases run almost to the edge, so the through
 * slot only needs a token rim to stay closed.
 */
const SLOTTA_FIT_RIM = 0.3;

const ERROR_CONVERTER_CLEARANCE_NEGATIVE = 'The converter clearance must not be negative.';
const ERROR_CONVERTER_DEPTH_INVALID =
  'The converter insert depth must be positive and smaller than the base height.';
const ERROR_CONVERTER_INSERT_TOO_LARGE = `The insert shape plus clearance does not fit inside the outer shape with a ${MIN_RIM} mm rim.`;
const ERROR_EDGE_SLOPE_NEGATIVE = 'The edge slope must not be negative.';
const ERROR_EDGE_SLOPE_TOO_LARGE =
  'The edge slope must be smaller than half the smallest footprint dimension.';
const ERROR_FREEFORM_POINTS_INVALID =
  'A freeform shape needs at least three points, or one circle with a positive radius.';
const ERROR_FREEFORM_SELF_INTERSECTING = 'The freeform outline must not intersect itself.';
const ERROR_FREEFORM_TAPER_REQUIRES_CONVEX =
  'Edge slope and lip radius require a convex freeform outline; use circles mode or a convex drawing.';
const ERROR_HEIGHT_POSITIVE = 'The base height must be positive.';
const ERROR_HOLLOW_TOP_TOO_THICK = 'The hollow top thickness must be smaller than the base height.';
const ERROR_HOLLOW_VALUES_POSITIVE =
  'The hollow wall thickness and top thickness must be positive.';
const ERROR_HOLLOW_WALL_TOO_THICK =
  'The edge slope plus the hollow wall thickness must be smaller than half the smallest footprint dimension.';
const ERROR_LIP_RADIUS_INVALID =
  'The lip radius must not be negative, and a lip arc larger than the base height must still reach the top face; reduce the lip radius or the edge slope.';
const ERROR_LIP_TRUNCATED_REQUIRES_ROUND =
  'A lip radius larger than the base height makes the whole side one truncated arc, which is only supported on plain round bases.';
const ERROR_HOLLOW_SUPPORTS_INVALID =
  'Support pillars need a diameter of 1.5 mm to 8 mm, grid ribs a thickness of 0.8 mm to 8 mm, with spacing of at least the size plus 4 mm.';
const ERROR_LETTERING_DEPTH_INVALID =
  'The lettering depth must leave material behind the engraving.';
const ERROR_LETTERING_SIDE_UNSUPPORTED =
  'Side lettering requires a zero lip radius and letters smaller than the side height.';
const ERROR_LETTERING_DOES_NOT_FIT =
  'The lettering does not fit on the rim; shorten the text, reduce the size, or enlarge the base.';
const ERROR_LETTERING_REQUIRES_ROUND =
  'Lettering is currently supported on plain round bases only.';
const ERROR_LETTERING_TEXT_INVALID = 'The lettering text must be between 1 and 24 characters.';
const ERROR_LETTERING_VALUES_INVALID =
  'The lettering size must be positive and the margin at least a quarter of the size.';
const ERROR_MAGNET_COUNT_INVALID = 'The magnet count must be a whole number of at least 1.';
const ERROR_MAGNET_DIMENSIONS_POSITIVE = 'The magnet dimensions and depth must be positive.';
const ERROR_MAGNET_OUTSIDE_FOOTPRINT =
  'A magnet slot including its padding does not fit inside the base footprint.';
const ERROR_MAGNET_SPACING_TOO_SMALL =
  'The magnet spacing must be at least the magnet footprint size.';
const ERROR_MAGNET_TOO_DEEP = 'The magnet depth plus padding must be smaller than the base height.';
const ERROR_PLAQUE_DOES_NOT_FIT =
  'The plaque must fit its side: within one flat side on straight-edged bases, at most 300 degrees around on round ones, and at least 0.6 mm shorter than the base height minus the lip.';
const ERROR_PLAQUE_EXCLUSIVE =
  'Rim lettering and side plaques cannot be combined; put the text on the plaque instead.';
const ERROR_PLAQUE_TEXT_INVALID =
  'The plaque text must be at most 24 characters with positive size and depth, letters no taller than the plaque, a stroke boost up to 0.4 mm, and it must fit within the plaque width.';
const ERROR_PLAQUE_TEXT_REQUIRES_ROUND = 'Plaque text is only supported on round bases.';
const ERROR_PLAQUE_VALUES_INVALID =
  'The plaque width and height must be positive, the thickness between 0.2 and 2 mm, and the rivet height between 0 and 0.6 mm.';
const ERROR_QUALITY_OUT_OF_RANGE = 'The chord tolerance must be between 0.002 mm and 0.5 mm.';
const ERROR_RECESS_INSET_TOO_LARGE =
  'The recess inset must be smaller than half the smallest footprint dimension.';
const ERROR_RECESS_TOO_DEEP = 'The recess depth must leave material below the recess floor.';
const ERROR_RECESS_VALUES_INVALID =
  'The recess depth must be positive and the inset must not be negative.';
const ERROR_SHAPE_DIMENSIONS_POSITIVE = 'All shape dimensions must be positive.';
const ERROR_SHAPE_PROPORTIONS_INVALID = 'The shape length must be at least the shape width.';
const ERROR_SLOTTA_DIMENSIONS_POSITIVE = 'The slotta slot length and width must be positive.';
const ERROR_SLOTTA_OUTSIDE_FOOTPRINT = `The slotta slot does not fit inside the top face with a ${SLOTTA_FIT_RIM} mm rim.`;
const ERROR_SLOTTA_OVERLAPS_MAGNETS =
  'The slotta slot including its rim must not cut into a magnet slot or its holder.';

function shapeDimensionIssues(shape: ShapeSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dims: number[] = [];
  if (shape.kind === 'round') {
    dims.push(shape.diameter);
  } else if (shape.kind === 'square' || shape.kind === 'hex') {
    dims.push(shape.size);
  } else if (shape.kind !== 'gwOval') {
    dims.push(shape.length, shape.width);
    if (shape.length < shape.width) {
      issues.push({ code: 'shape-proportions', message: ERROR_SHAPE_PROPORTIONS_INVALID });
    }
  }
  if (dims.some((d) => !(d > 0))) {
    issues.push({ code: 'shape-dimensions', message: ERROR_SHAPE_DIMENSIONS_POSITIVE });
  }
  return issues;
}

function rectCorners(
  hx: number,
  hy: number,
  angleRad: number,
  cx: number,
  cy: number,
): [number, number][] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return (
    [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ] as [number, number][]
  ).map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
}

function sampleBoundary(shape: ResolvedShape, samples: number): [number, number][] {
  if (shape.type === 'rect') {
    return rectCorners(shape.hx, shape.hy, 0, 0, 0);
  }
  const points: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    switch (shape.type) {
      case 'circle':
        points.push([shape.r * Math.cos(t), shape.r * Math.sin(t)]);
        break;
      case 'ellipse':
        points.push([shape.a * Math.cos(t), shape.b * Math.sin(t)]);
        break;
      case 'stadium': {
        const cx = Math.cos(t) >= 0 ? shape.flank : -shape.flank;
        points.push([cx + shape.r * Math.cos(t), shape.r * Math.sin(t)]);
        break;
      }
    }
  }
  return points;
}

interface FootprintCheck {
  contains(x: number, y: number, inset: number): boolean;
  rIn: number;
}

function analyticFootprint(shape: ResolvedShape): FootprintCheck {
  return {
    contains: (x, y, inset) => pointInShape(shape, x, y, inset),
    rIn: inradius(shape),
  };
}

function freeformFootprint(outline: Vec[]): FootprintCheck {
  let cx = 0;
  let cy = 0;
  let areaSum = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    const cross = x1 * y2 - x2 * y1;
    areaSum += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const area = areaSum / 2;
  const centroidX = area === 0 ? 0 : cx / (6 * area);
  const centroidY = area === 0 ? 0 : cy / (6 * area);
  return {
    contains: (x, y, inset) => polygonContains(outline, x, y, inset),
    rIn: distanceToBoundary(outline, centroidX, centroidY),
  };
}

function freeformIssues(spec: FreeformSpec, outline: Vec[], tapered: boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const enoughPoints =
    spec.mode === 'circles'
      ? spec.points.length >= 1 && spec.points.every((_, i) => (spec.radii[i] ?? 0) > 0)
      : spec.points.length >= 3;
  if (!enoughPoints || Math.abs(polygonArea(outline)) <= 0) {
    issues.push({ code: 'freeform-points', message: ERROR_FREEFORM_POINTS_INVALID });
    return issues;
  }
  if (spec.mode !== 'circles' && !isSimplePolygon(outline)) {
    issues.push({ code: 'freeform-self-intersecting', message: ERROR_FREEFORM_SELF_INTERSECTING });
  }
  if (tapered && !isConvex(outline)) {
    issues.push({ code: 'freeform-taper', message: ERROR_FREEFORM_TAPER_REQUIRES_CONVEX });
  }
  return issues;
}

export function validate(params: BaseParams): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const outerSpec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
  const tapered = params.edgeSlope > 0 || params.lipRadius > 0;
  let footprintCheck: FootprintCheck;
  if (outerSpec.kind === 'freeform') {
    const outline = freeformOutline(outerSpec, 0.05);
    issues.push(...freeformIssues(outerSpec, outline, tapered));
    if (issues.length > 0) {
      return issues;
    }
    footprintCheck = freeformFootprint(outline);
  } else {
    issues.push(...shapeDimensionIssues(outerSpec));
    if (issues.length > 0) {
      return issues;
    }
    footprintCheck = analyticFootprint(resolveShape(outerSpec));
  }

  const footprint = footprintCheck;
  const rIn = footprint.rIn;
  const topInset = topInsetFor(params.height, params.edgeSlope, params.lipRadius);

  if (!(params.height > 0)) {
    issues.push({ code: 'height', message: ERROR_HEIGHT_POSITIVE });
  }
  if (params.edgeSlope < 0) {
    issues.push({ code: 'edge-slope-negative', message: ERROR_EDGE_SLOPE_NEGATIVE });
  } else if (topInset >= rIn) {
    issues.push({ code: 'edge-slope-large', message: ERROR_EDGE_SLOPE_TOO_LARGE });
  }
  if (
    params.lipRadius < 0 ||
    !lipArcReachesTop(params.height, params.edgeSlope, params.lipRadius)
  ) {
    issues.push({ code: 'lip-radius', message: ERROR_LIP_RADIUS_INVALID });
  } else if (params.lipRadius > params.height && params.shape.kind !== 'round') {
    issues.push({ code: 'lip-radius', message: ERROR_LIP_TRUNCATED_REQUIRES_ROUND });
  }

  const { hollow, magnets, recess, slotta } = params;

  if (hollow !== null) {
    if (!(hollow.wall > 0) || !(hollow.topThickness > 0)) {
      issues.push({ code: 'hollow-values', message: ERROR_HOLLOW_VALUES_POSITIVE });
    } else {
      if (topInset + hollow.wall >= rIn) {
        issues.push({ code: 'hollow-wall', message: ERROR_HOLLOW_WALL_TOO_THICK });
      }
      if (hollow.topThickness >= params.height) {
        issues.push({ code: 'hollow-top', message: ERROR_HOLLOW_TOP_TOO_THICK });
      }
      if (hollow.supports !== null) {
        const { style, spacing, diameter } = hollow.supports;
        const minSize = style === 'grid' ? 0.8 : 1.5;
        if (diameter < minSize || diameter > 8 || spacing < diameter + 4 || spacing > 60) {
          issues.push({ code: 'hollow-supports', message: ERROR_HOLLOW_SUPPORTS_INVALID });
        }
      }
    }
  }

  if (magnets !== null) {
    const halfX = (magnets.shape === 'round' ? magnets.diameter : magnets.length) / 2;
    const halfY = (magnets.shape === 'round' ? magnets.diameter : magnets.width) / 2;
    if (!(halfX > 0) || !(halfY > 0) || !(magnets.depth > 0) || magnets.padding < 0) {
      issues.push({ code: 'magnet-dimensions', message: ERROR_MAGNET_DIMENSIONS_POSITIVE });
    } else {
      if (!Number.isInteger(magnets.count) || magnets.count < 1) {
        issues.push({ code: 'magnet-count', message: ERROR_MAGNET_COUNT_INVALID });
      }
      if (magnets.depth + magnets.padding >= params.height) {
        issues.push({ code: 'magnet-depth', message: ERROR_MAGNET_TOO_DEEP });
      }
      if (
        magnets.layout === 'line' &&
        magnets.count > 1 &&
        magnets.spacing < 2 * (halfX + magnets.padding)
      ) {
        issues.push({ code: 'magnet-spacing', message: ERROR_MAGNET_SPACING_TOO_SMALL });
      }
      const fits = magnetCenters(params).every(([cx, cy]) =>
        rectCorners(halfX + magnets.padding, halfY + magnets.padding, 0, cx, cy).every(
          ([px, py]) => footprint.contains(px, py, topInset),
        ),
      );
      if (!fits) {
        issues.push({ code: 'magnet-fit', message: ERROR_MAGNET_OUTSIDE_FOOTPRINT });
      }
    }
  }

  if (recess !== null) {
    if (!(recess.depth > 0) || recess.inset < 0) {
      issues.push({ code: 'recess-values', message: ERROR_RECESS_VALUES_INVALID });
    } else {
      if (topInset + recess.inset >= rIn) {
        issues.push({ code: 'recess-inset', message: ERROR_RECESS_INSET_TOO_LARGE });
      }
      const floorReserve = hollow !== null ? hollow.topThickness : 0;
      if (recess.depth + floorReserve >= params.height) {
        issues.push({ code: 'recess-depth', message: ERROR_RECESS_TOO_DEEP });
      }
    }
  }

  if (slotta !== null) {
    if (!(slotta.length > 0) || !(slotta.width > 0)) {
      issues.push({ code: 'slotta-dimensions', message: ERROR_SLOTTA_DIMENSIONS_POSITIVE });
    } else {
      const corners = rectCorners(
        slotta.length / 2,
        slotta.width / 2,
        (slotta.angleDeg * Math.PI) / 180,
        slotta.offsetX,
        slotta.offsetY,
      );
      const fits = corners.every(([px, py]) =>
        footprint.contains(px, py, topInset + SLOTTA_FIT_RIM),
      );
      if (!fits) {
        issues.push({ code: 'slotta-fit', message: ERROR_SLOTTA_OUTSIDE_FOOTPRINT });
      }
      if (magnets !== null && slottaTouchesMagnets(slotta, magnets, magnetCenters(params))) {
        issues.push({ code: 'slotta-magnet-overlap', message: ERROR_SLOTTA_OVERLAPS_MAGNETS });
      }
    }
  }

  if (params.lettering !== null) {
    const lettering = params.lettering;
    if (params.shape.kind !== 'round') {
      issues.push({ code: 'lettering-shape', message: ERROR_LETTERING_REQUIRES_ROUND });
    } else {
      const trimmed = lettering.text.trim();
      if (trimmed.length < 1 || trimmed.length > 24) {
        issues.push({ code: 'lettering-text', message: ERROR_LETTERING_TEXT_INVALID });
      }
      if (
        !(lettering.sizeMm > 0) ||
        lettering.strokeBoostMm < 0 ||
        lettering.strokeBoostMm > 0.4 ||
        (lettering.placement === 'top' && lettering.margin < lettering.sizeMm / 4)
      ) {
        issues.push({ code: 'lettering-values', message: ERROR_LETTERING_VALUES_INVALID });
      }
      const engraveLimit =
        lettering.placement === 'top'
          ? hollow !== null
            ? hollow.topThickness
            : params.height
          : hollow !== null
            ? hollow.wall
            : params.shape.diameter / 8;
      const depthLimit = lettering.style === 'embossed' ? 5 : engraveLimit;
      if (!(lettering.depth > 0) || lettering.depth >= depthLimit) {
        issues.push({ code: 'lettering-depth', message: ERROR_LETTERING_DEPTH_INVALID });
      }
      if (
        lettering.placement === 'side' &&
        (params.lipRadius > 0 || lettering.sizeMm * 1.25 > params.height)
      ) {
        issues.push({ code: 'lettering-side', message: ERROR_LETTERING_SIDE_UNSUPPORTED });
      }
      const layoutRadius =
        lettering.placement === 'top'
          ? params.shape.diameter / 2 - topInset - lettering.margin
          : params.shape.diameter / 2 - params.edgeSlope / 2;
      const approxWidth = APPROX_ADVANCE_RATIO * lettering.sizeMm * trimmed.length;
      const fits =
        layoutRadius > (lettering.placement === 'top' ? lettering.sizeMm : 1) &&
        approxWidth / layoutRadius <= (300 * Math.PI) / 180 &&
        (lettering.placement === 'side' ||
          recess === null ||
          recess.inset >= lettering.margin + 1.3 * lettering.sizeMm);
      if (!fits) {
        issues.push({ code: 'lettering-fit', message: ERROR_LETTERING_DOES_NOT_FIT });
      }
    }
  }

  if (params.shape.kind === 'converter') {
    const converter = params.shape;
    issues.push(...shapeDimensionIssues(converter.insert));
    if (converter.clearance < 0) {
      issues.push({ code: 'converter-clearance', message: ERROR_CONVERTER_CLEARANCE_NEGATIVE });
    }
    if (!(converter.insertDepth > 0) || converter.insertDepth >= params.height) {
      issues.push({ code: 'converter-depth', message: ERROR_CONVERTER_DEPTH_INVALID });
    }
    if (issues.length === 0) {
      const insert = resolveShape(converter.insert);
      const boundary = sampleBoundary(insert, 64);
      const grown = converter.clearance;
      const fits = boundary.every(([px, py]) => {
        const len = Math.hypot(px, py);
        const scale = len === 0 ? 0 : (len + grown) / len;
        return footprint.contains(px * scale, py * scale, topInset + MIN_RIM);
      });
      if (!fits) {
        issues.push({ code: 'converter-fit', message: ERROR_CONVERTER_INSERT_TOO_LARGE });
      }
    }
  }

  const plaques = configuredPlaques(params);
  if (plaques.length > 0 && params.lettering !== null) {
    issues.push({ code: 'plaque-exclusive', message: ERROR_PLAQUE_EXCLUSIVE });
  }
  for (const plaque of plaques) {
    if (
      !(plaque.widthMm > 0) ||
      !(plaque.heightMm > 0) ||
      !(plaque.thicknessMm >= 0.2) ||
      plaque.thicknessMm > 2 ||
      !(plaque.rivetHeightMm > 0) ||
      plaque.rivetHeightMm > 0.6
    ) {
      issues.push({ code: 'plaque-values', message: ERROR_PLAQUE_VALUES_INVALID });
    }
    const plaqueSpec = params.shape.kind === 'converter' ? params.shape.outer : params.shape;
    let widthLimit = Infinity;
    if (plaqueSpec.kind === 'round') {
      const wallRadius = plaqueSpec.diameter / 2 - params.edgeSlope / 2;
      widthLimit = Math.max(wallRadius, 0.01) * ((300 * Math.PI) / 180);
    } else if (plaqueSpec.kind === 'square') {
      widthLimit = plaqueSpec.size - 0.8;
    } else if (plaqueSpec.kind === 'rect') {
      const angle = ((plaque.angleDeg % 360) + 360) % 360;
      const facingX = angle < 45 || angle > 315 || (angle > 135 && angle < 225);
      widthLimit = (facingX ? plaqueSpec.width : plaqueSpec.length) - 0.8;
    } else if (plaqueSpec.kind === 'hex') {
      widthLimit = plaqueSpec.size / Math.sqrt(3) - 0.8;
    } else if (plaqueSpec.kind !== 'freeform') {
      const boundary = sampleBoundary(resolveShape(plaqueSpec), 96);
      let perimeter = 0;
      for (let i = 0; i < boundary.length; i++) {
        const [x1, y1] = boundary[i];
        const [x2, y2] = boundary[(i + 1) % boundary.length];
        perimeter += Math.hypot(x2 - x1, y2 - y1);
      }
      widthLimit = perimeter * 0.45;
    }
    if (
      plaque.widthMm > widthLimit ||
      plaque.heightMm > params.height - params.lipRadius - 0.6
    ) {
      issues.push({ code: 'plaque-fit', message: ERROR_PLAQUE_DOES_NOT_FIT });
    }
    const text = plaque.text;
    if (text !== null && text.text.trim() !== '') {
      if (params.shape.kind !== 'round') {
        issues.push({ code: 'plaque-text', message: ERROR_PLAQUE_TEXT_REQUIRES_ROUND });
      } else {
        const trimmed = text.text.trim();
        const approxWidth = APPROX_ADVANCE_RATIO * text.sizeMm * trimmed.length;
        if (
          trimmed.length > 24 ||
          !(text.sizeMm > 0) ||
          !(text.depth > 0) ||
          text.strokeBoostMm < 0 ||
          text.strokeBoostMm > 0.4 ||
          text.sizeMm * 1.25 > plaque.heightMm ||
          approxWidth > plaque.widthMm - 1
        ) {
          issues.push({ code: 'plaque-text', message: ERROR_PLAQUE_TEXT_INVALID });
        }
      }
    }
  }

  if (params.surface !== null) {
    issues.push(
      ...validateSurface(params.surface, params.height, hollow !== null ? hollow.topThickness : null),
    );
  }

  if (!(params.quality.chordTolMm >= 0.002) || !(params.quality.chordTolMm <= 0.5)) {
    issues.push({ code: 'quality', message: ERROR_QUALITY_OUT_OF_RANGE });
  }

  return issues;
}

/**
 * Tests whether the slotta slot, grown by its housing rim, touches any
 * magnet slot grown by its padding. The slot rect is rotated, so the test
 * runs in the slot's own frame where it is axis-aligned.
 */
function slottaTouchesMagnets(
  slotta: SlottaParams,
  magnets: MagnetParams,
  centers: [number, number][],
): boolean {
  const angle = (-slotta.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfLength = slotta.length / 2 + SLOTTA_RIM;
  const halfWidth = slotta.width / 2 + SLOTTA_RIM;
  return centers.some(([x, y]) => {
    const dx = x - slotta.offsetX;
    const dy = y - slotta.offsetY;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    if (magnets.shape === 'round') {
      const radius = magnets.diameter / 2 + magnets.padding;
      const nearestX = Math.min(Math.max(localX, -halfLength), halfLength);
      const nearestY = Math.min(Math.max(localY, -halfWidth), halfWidth);
      return Math.hypot(localX - nearestX, localY - nearestY) < radius;
    }
    const magnetCircumradius = Math.hypot(magnets.length, magnets.width) / 2 + magnets.padding;
    const nearestX = Math.min(Math.max(localX, -halfLength), halfLength);
    const nearestY = Math.min(Math.max(localY, -halfWidth), halfWidth);
    return Math.hypot(localX - nearestX, localY - nearestY) < magnetCircumradius;
  });
}

/** Center X positions of a row of `count` magnets spaced `spacing` apart. */

