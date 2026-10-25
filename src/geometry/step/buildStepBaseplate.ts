import type { Drawing, Point2D, Shape3D, Sketch } from 'replicad';
import { draw, drawCircle, drawRectangle, drawRoundedRectangle, makeCompound } from 'replicad';
import type {
  BaseplateConnectorHole,
  BaseplateParams,
  BaseplatePiece,
  BaseplateRect,
} from '../../params/baseplate.ts';
import {
  BASEPLATE_CELL_RADIUS_MM,
  BASEPLATE_CUT_MM,
  BASEPLATE_PROFILE,
  BASEPLATE_PROFILE_HEIGHT_MM,
  BASEPLATE_STAR_MM,
  baseplateLayout,
  baseplatePrintKey,
  connectorHoleZ,
} from '../../params/baseplate.ts';
import { GRID_PITCH_MM } from '../../params/paintRack.ts';
import { baseplatePieces } from '../buildBaseplate.ts';
import { asShape3D } from './buildStepShape.ts';

function rectDrawing(rect: BaseplateRect): Drawing {
  return drawRectangle(rect.x1 - rect.x0, rect.y1 - rect.y0).translate(
    (rect.x0 + rect.x1) / 2,
    (rect.y0 + rect.y1) / 2,
  );
}

/** The union of several outlines, extruded from `z0` to `z1` in one piece. */
function extrudeUnion(drawings: Drawing[], z0: number, z1: number): Shape3D {
  const outline = drawings.slice(1).reduce((merged, drawing) => merged.fuse(drawing), drawings[0]);
  return asShape3D(outline.sketchOnPlane('XY', z0).extrude(z1 - z0));
}

/** Gaps between the merged spans, within the outermost ones. */
function gapsBetween(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let reach = sorted[0][1];
  for (const [start, end] of sorted.slice(1)) {
    if (start > reach + 1e-9) {
      gaps.push([reach, start]);
    }
    reach = Math.max(reach, end);
  }
  return gaps;
}

/**
 * The bar lattice as the part outline with the open fields between the
 * bars cut out, which OCCT handles more reliably than a union of crossing
 * bars.
 */
function barOutline(bars: BaseplateRect[]): Drawing {
  const across = bars.filter((bar) => bar.x1 - bar.x0 < bar.y1 - bar.y0);
  const along = bars.filter((bar) => bar.x1 - bar.x0 >= bar.y1 - bar.y0);
  const outline = {
    x0: Math.min(...bars.map((bar) => bar.x0)),
    x1: Math.max(...bars.map((bar) => bar.x1)),
    y0: Math.min(...bars.map((bar) => bar.y0)),
    y1: Math.max(...bars.map((bar) => bar.y1)),
  };
  const xGaps = gapsBetween(across.map((bar) => [bar.x0, bar.x1]));
  const yGaps = gapsBetween(along.map((bar) => [bar.y0, bar.y1]));
  return xGaps
    .flatMap(([x0, x1]) => yGaps.map(([y0, y1]) => rectDrawing({ x0, x1, y0, y1 })))
    .reduce((lattice, field) => lattice.cut(field), rectDrawing(outline));
}

/**
 * Applies `op` with each tool in turn. OCCT booleans against a compound of
 * tools that overlap each other silently drop material, so every boolean
 * here takes a single tool.
 */
function oneByOne(
  shape: Shape3D,
  tools: Shape3D[],
  op: (shape: Shape3D, tool: Shape3D) => unknown,
): Shape3D {
  return tools.reduce((merged, tool) => asShape3D(op(merged, tool)), shape);
}

/**
 * The opening of one grid cell through the receiving profile, centered on
 * the origin: a ruled loft per profile segment, carried on straight below
 * the bottom and above the top so it cuts cleanly.
 */
function cellOpening(): Shape3D {
  const levels: [number, number][] = [
    [-BASEPLATE_CUT_MM, BASEPLATE_PROFILE[0][1]],
    ...BASEPLATE_PROFILE,
    [BASEPLATE_PROFILE_HEIGHT_MM + BASEPLATE_CUT_MM, 0],
  ];
  const slice = ([z, inset]: [number, number]) => {
    const size = GRID_PITCH_MM - 2 * inset;
    return drawRoundedRectangle(size, size, BASEPLATE_CELL_RADIUS_MM - inset).sketchOnPlane(
      'XY',
      z,
    ) as Sketch;
  };
  const frustums = levels
    .slice(1)
    .map((level, i) => asShape3D(slice(levels[i]).loftWith(slice(level), { ruled: true })));
  return oneByOne(frustums[0], frustums.slice(1), (merged, frustum) => merged.fuse(frustum));
}

function connectorHole(params: BaseplateParams, hole: BaseplateConnectorHole): Shape3D {
  const radius = params.connectorHoleMm / 2;
  const tip = radius / Math.SQRT2;
  // A circle with a pointed top, so the hole prints without overhang.
  const outline = drawCircle(radius).fuse(
    draw([0, 0])
      .lineTo([tip, tip])
      .lineTo([0, radius * Math.SQRT2])
      .lineTo([-tip, tip])
      .close(),
  );
  // Sketched across the X axis and extruded along it, then turned onto Y if needed.
  const rod = asShape3D(outline.sketchOnPlane('YZ', [-hole.length / 2, 0, 0]).extrude(hole.length));
  const turned = hole.alongY ? asShape3D(rod.rotate(90, [0, 0, 0], [0, 0, 1])) : rod;
  return asShape3D(turned.translate([hole.x, hole.y, connectorHoleZ(params)]));
}

/**
 * The star hole of the crossing at (x, y), drawn as a path of arcs: OCCT
 * fails on booleans where circles only touch, as the corner arcs of a star
 * do. Quadrants outside the grid are left out, so the star stops at the
 * grid edge and the bars beyond stay joined.
 */
function starDrawing(x: number, y: number, grid: BaseplateRect): Drawing {
  const size = BASEPLATE_STAR_MM;
  const bow = size - size / Math.SQRT2;
  // Quadrants counterclockwise from +X+Y, each an arc from tip to tip.
  const quadrants: { sx: number; sy: number; from: Point2D; to: Point2D }[] = [
    { sx: 1, sy: 1, from: [size, 0], to: [0, size] },
    { sx: -1, sy: 1, from: [0, size], to: [-size, 0] },
    { sx: -1, sy: -1, from: [-size, 0], to: [0, -size] },
    { sx: 1, sy: -1, from: [0, -size], to: [size, 0] },
  ];
  const inside = quadrants.map(
    ({ sx, sy }) =>
      x + sx * 1e-6 > grid.x0 &&
      x + sx * 1e-6 < grid.x1 &&
      y + sy * 1e-6 > grid.y0 &&
      y + sy * 1e-6 < grid.y1,
  );
  // Start after a left-out quadrant so the kept ones run in one stretch.
  const start = inside.every(Boolean) ? 0 : (inside.findIndex((kept) => !kept) + 1) % 4;
  const kept = [0, 1, 2, 3]
    .map((i) => quadrants[(start + i) % 4])
    .filter((_, i) => inside[(start + i) % 4]);
  const at = ([px, py]: Point2D): Point2D => [x + px, y + py];
  let pen = draw(at(kept[0].from));
  for (const { sx, sy, to } of kept) {
    pen = pen.threePointsArcTo(at(to), at([sx * bow, sy * bow]));
  }
  return kept.length === 4 ? pen.close() : pen.lineTo([x, y]).close();
}

/**
 * A rounded drawer corner as two paths of arcs: the region outside the
 * arc, and the region inside it within the corner square.
 */
function cornerDrawings(
  corner: { x: number; y: number; dx: number; dy: number },
  radius: number,
): { outside: Drawing; inside: Drawing } {
  const { x, y, dx, dy } = corner;
  const cx = x + dx * radius;
  const cy = y + dy * radius;
  const onArc: Point2D = [cx - (dx * radius) / Math.SQRT2, cy - (dy * radius) / Math.SQRT2];
  const outside = draw([x, y]).lineTo([cx, y]).threePointsArcTo([x, cy], onArc).close();
  const inside = draw([cx, y]).threePointsArcTo([x, cy], onArc).lineTo([cx, cy]).close();
  return { outside, inside };
}

/** Everything that makes one node differ from another, in the node's own frame. */
interface NodeVariant {
  /**
   * The node's extent, clipped to the grid and to half a unit round the
   * crossing; it also clips the star hole to the quadrants inside the grid.
   */
  box: BaseplateRect;
  star: boolean;
  holes: BaseplateConnectorHole[];
}

function nodeKey(variant: NodeVariant): string {
  const round = (value: number) => value.toFixed(4);
  const { box, star, holes } = variant;
  return [
    [box.x0, box.x1, box.y0, box.y1].map(round).join(','),
    star,
    holes.map((hole) => `${round(hole.x)},${round(hole.y)},${hole.alongY}`).join(';'),
  ].join('|');
}

/**
 * A full node at the origin: the receiving profile within half a unit of
 * the crossing less the openings of the four cells round it, kept within
 * the arm reach, whose ends slope down outwards at 45 degrees.
 */
function buildFullNode(params: BaseplateParams, opening: Shape3D): Shape3D {
  const half = GRID_PITCH_MM / 2;
  const plate = extrudeUnion(
    [rectDrawing({ x0: -half, x1: half, y0: -half, y1: half })],
    0,
    BASEPLATE_PROFILE_HEIGHT_MM,
  );
  const cells = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => asShape3D(opening.clone().translate([sx * half, sy * half, 0]))),
  );
  const profile = oneByOne(plate, cells, (merged, cell) => merged.cut(cell));
  const level = (z: number) => {
    const reach = params.nodeArmMm + BASEPLATE_PROFILE_HEIGHT_MM - z;
    return rectDrawing({ x0: -reach, x1: reach, y0: -reach, y1: reach }).sketchOnPlane(
      'XY',
      z,
    ) as Sketch;
  };
  const bottom = -BASEPLATE_CUT_MM;
  const top = BASEPLATE_PROFILE_HEIGHT_MM + BASEPLATE_CUT_MM;
  return asShape3D(
    profile.intersect(asShape3D(level(bottom).loftWith(level(top), { ruled: true }))),
  );
}

/** A node variant: the full node clipped to its box, with its holes cut. */
function buildNode(params: BaseplateParams, variant: NodeVariant, full: Shape3D): Shape3D {
  const half = GRID_PITCH_MM / 2;
  const { box } = variant;
  const bottom = -BASEPLATE_CUT_MM;
  const top = BASEPLATE_PROFILE_HEIGHT_MM + BASEPLATE_CUT_MM;
  const clipped =
    [box.x0, box.y0].every((low) => low <= -half + 1e-6) &&
    [box.x1, box.y1].every((high) => high >= half - 1e-6)
      ? asShape3D(full.clone())
      : asShape3D(full.clone().intersect(extrudeUnion([rectDrawing(box)], bottom, top)));
  const holes = variant.holes.map((hole) => connectorHole(params, hole));
  if (variant.star) {
    holes.push(extrudeUnion([starDrawing(0, 0, box)], bottom, top));
  }
  return oneByOne(clipped, holes, (merged, hole) => merged.cut(hole));
}

/** Node variants built so far, shared by the parts of one drawer. */
interface NodeCache {
  full: Shape3D;
  variants: Map<string, Shape3D>;
}

/**
 * One part, centered on its outline. Nodes come in few variants, so each
 * is built once and placed at its crossings. Every node stays within half
 * a unit of its crossing, so the nodes never overlap each other and join
 * the bars in a single boolean.
 */
function buildStepPiece(
  params: BaseplateParams,
  piece: BaseplatePiece,
  opening: Shape3D,
  cache: NodeCache,
): Shape3D {
  const layout = baseplateLayout(params, piece);
  const half = GRID_PITCH_MM / 2;
  const { grid } = layout;
  const holes = params.connectorHoles ? layout.connectorHoles : [];
  const starCrossings = params.starHoles ? layout.starCrossings : [];
  const stars = new Set(starCrossings.map(([x, y]) => `${x},${y}`));
  const nodes = layout.crossings.map(([x, y]) => {
    const box = {
      x0: Math.max(x - half, grid.x0) - x,
      x1: Math.min(x + half, grid.x1) - x,
      y0: Math.max(y - half, grid.y0) - y,
      y1: Math.min(y + half, grid.y1) - y,
    };
    const variant: NodeVariant = {
      box,
      star: stars.has(`${x},${y}`),
      // Every hole that reaches into the node's box, in the node's frame.
      holes: holes
        .map((hole) => ({ ...hole, x: hole.x - x, y: hole.y - y }))
        .filter((hole) => {
          const along = hole.length / 2;
          const across = params.connectorHoleMm;
          const [rx, ry] = hole.alongY ? [across, along] : [along, across];
          return (
            hole.x + rx > box.x0 &&
            hole.x - rx < box.x1 &&
            hole.y + ry > box.y0 &&
            hole.y - ry < box.y1
          );
        }),
    };
    const key = nodeKey(variant);
    let node = cache.variants.get(key);
    if (node === undefined) {
      node = buildNode(params, variant, cache.full);
      cache.variants.set(key, node);
    }
    return asShape3D(node.clone().translate([x, y, 0]));
  });
  const lattice = extrudeUnion([barOutline(layout.bars)], 0, params.barHeightMm);
  // The star holes run on through the bars; they lie apart from each other.
  const bars =
    starCrossings.length === 0
      ? lattice
      : asShape3D(
          lattice.cut(
            extrudeUnion(
              starCrossings.map(([x, y]) => starDrawing(x, y, grid)),
              -BASEPLATE_CUT_MM,
              params.barHeightMm + BASEPLATE_CUT_MM,
            ),
          ),
        );
  let solid = asShape3D(bars.fuse(makeCompound(nodes) as unknown as Shape3D));
  const bottom = -BASEPLATE_CUT_MM;
  const top = BASEPLATE_PROFILE_HEIGHT_MM + BASEPLATE_CUT_MM;
  const radius = params.cornerRadiusMm;
  for (const corner of radius > 0 ? layout.corners : []) {
    // What lies outside the corner arc goes; inside it the corner is filled
    // at bar height up to the opening of the cell next to it.
    const { outside, inside } = cornerDrawings(corner, radius);
    const [cellX, cellY] = corner.cell;
    const cell = asShape3D(opening.clone().translate([cellX + half, cellY + half, 0]));
    const fill = asShape3D(extrudeUnion([inside], 0, params.barHeightMm).cut(cell));
    solid = asShape3D(solid.cut(extrudeUnion([outside], bottom, top)));
    solid = asShape3D(solid.fuse(fill));
  }
  return solid;
}

/** Whether two parts have the same filler and seams on the same sides. */
function sameSides(a: BaseplatePiece, b: BaseplatePiece): boolean {
  const sides = (piece: BaseplatePiece) =>
    [
      piece.padLeft,
      piece.padRight,
      piece.padFront,
      piece.padBack,
      piece.seamLeft,
      piece.seamRight,
      piece.seamFront,
      piece.seamBack,
    ].join(',');
  return sides(a) === sides(b);
}

/** The B-rep parts of the drawer for STEP export, each in place. Requires an initialized OCCT. */
export function buildStepBaseplateParts(
  params: BaseplateParams,
): { piece: BaseplatePiece; shape: Shape3D }[] {
  const opening = cellOpening();
  const cache: NodeCache = { full: buildFullNode(params, opening), variants: new Map() };
  // Parts that print the same are built once: copied as they are, or
  // turned by half a turn when they match only that way.
  const built = new Map<string, { piece: BaseplatePiece; solid: Shape3D }>();
  return baseplatePieces(params).map((piece) => {
    const key = baseplatePrintKey(piece);
    const twin = built.get(key);
    let solid: Shape3D;
    if (twin === undefined) {
      solid = buildStepPiece(params, piece, opening, cache);
      built.set(key, { piece, solid });
    } else {
      const copy = asShape3D(twin.solid.clone());
      solid = sameSides(twin.piece, piece)
        ? copy
        : asShape3D(copy.rotate(180, [0, 0, 0], [0, 0, 1]));
    }
    return {
      piece,
      shape: asShape3D(solid.clone().translate([piece.centerX, piece.centerY, 0])),
    };
  });
}

/** The B-rep baseplate as one compound of its parts. Requires an initialized OCCT. */
export function buildStepBaseplate(params: BaseplateParams): Shape3D {
  const parts = buildStepBaseplateParts(params).map(({ shape }) => shape);
  return parts.length === 1 ? parts[0] : (makeCompound(parts) as unknown as Shape3D);
}
