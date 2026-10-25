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

function buildStepPiece(params: BaseplateParams, piece: BaseplatePiece, opening: Shape3D): Shape3D {
  const layout = baseplateLayout(params, piece);
  const arm = params.nodeArmMm;
  const openings = layout.cells.map(([x, y]) =>
    asShape3D(opening.clone().translate([x + GRID_PITCH_MM / 2, y + GRID_PITCH_MM / 2, 0])),
  );
  const plate = extrudeUnion([rectDrawing(layout.grid)], 0, BASEPLATE_PROFILE_HEIGHT_MM);
  const profile = oneByOne(plate, openings, (merged, cell) => merged.cut(cell));
  // Each node a square frustum: the arm length at the top, its ends sloping
  // down outwards at 45 degrees.
  const bottom = -BASEPLATE_CUT_MM;
  const top = BASEPLATE_PROFILE_HEIGHT_MM + BASEPLATE_CUT_MM;
  const level = (x: number, y: number, z: number) => {
    const half = arm + BASEPLATE_PROFILE_HEIGHT_MM - z;
    return rectDrawing({ x0: x - half, x1: x + half, y0: y - half, y1: y + half }).sketchOnPlane(
      'XY',
      z,
    ) as Sketch;
  };
  const frustums = layout.crossings.map(([x, y]) =>
    asShape3D(level(x, y, bottom).loftWith(level(x, y, top), { ruled: true })),
  );
  const reach = oneByOne(frustums[0], frustums.slice(1), (merged, node) => merged.fuse(node));
  const nodes = asShape3D(profile.intersect(reach));
  const bars = extrudeUnion([barOutline(layout.bars)], 0, params.barHeightMm);
  const holes: Shape3D[] = [];
  if (params.connectorHoles) {
    holes.push(...layout.connectorHoles.map((hole) => connectorHole(params, hole)));
  }
  if (params.starHoles && layout.starCrossings.length > 0) {
    holes.push(
      extrudeUnion(
        layout.starCrossings.map(([x, y]) => starDrawing(x, y, layout.grid)),
        bottom,
        top,
      ),
    );
  }
  let solid = oneByOne(asShape3D(nodes.fuse(bars)), holes, (merged, hole) => merged.cut(hole));
  const radius = params.cornerRadiusMm;
  for (const corner of radius > 0 ? layout.corners : []) {
    // What lies outside the corner arc goes; inside it the corner is filled
    // at bar height up to the opening of the cell next to it.
    const { outside, inside } = cornerDrawings(corner, radius);
    const [cellX, cellY] = corner.cell;
    const cell = asShape3D(
      opening.clone().translate([cellX + GRID_PITCH_MM / 2, cellY + GRID_PITCH_MM / 2, 0]),
    );
    const fill = asShape3D(extrudeUnion([inside], 0, params.barHeightMm).cut(cell));
    solid = asShape3D(solid.cut(extrudeUnion([outside], bottom, top)));
    solid = asShape3D(solid.fuse(fill));
  }
  return asShape3D(solid.translate([piece.centerX, piece.centerY, 0]));
}

/**
 * The B-rep baseplate for STEP export: every part of the drawer in place,
 * as a compound of separate solids. Requires an initialized OCCT.
 */
export function buildStepBaseplate(params: BaseplateParams): Shape3D {
  const opening = cellOpening();
  const parts = baseplatePieces(params).map((piece) => buildStepPiece(params, piece, opening));
  return parts.length === 1 ? parts[0] : (makeCompound(parts) as unknown as Shape3D);
}
