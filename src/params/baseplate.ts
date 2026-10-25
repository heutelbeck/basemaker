import { BAMBU_X2D_PLATE_MM, GRID_PITCH_MM } from './paintRack.ts';
import type { QualityParams } from './types.ts';
import type { ValidationIssue } from './validate.ts';

/** Where the grid sits in the drawer: centered, or against the start or end wall. */
export type BaseplateAlign = 'center' | 'start' | 'end';

/**
 * A lightweight Gridfinity baseplate for a whole drawer. Thin flat bars
 * run along every grid line and keep the parts in shape; the Gridfinity
 * receiving profile stands only around the grid line crossings (nodes),
 * which is all a bin needs to locate. The grid fills as many whole units
 * as the drawer takes, and flat bars reach on to the drawer walls over the
 * rest. The drawer is split into parts that fit the build plate; filament
 * pieces pushed through holes across the seams join neighboring parts.
 * Seen from the front of the drawer, X runs from the left wall (-X) to the
 * right and Y from the front (-Y) to the back, as on the build plate.
 */
export interface BaseplateParams {
  /** Inside width of the drawer, left to right. */
  drawerWidthMm: number;
  /** Inside depth of the drawer, front to back. */
  drawerDepthMm: number;
  /** Total play between the baseplate and the drawer walls on each axis. */
  clearanceMm: number;
  /** Grid position across the drawer: start is the left wall. */
  alignX: BaseplateAlign;
  /** Grid position along the drawer depth: start is the front wall. */
  alignY: BaseplateAlign;
  plateWidthMm: number;
  plateDepthMm: number;
  barWidthMm: number;
  barHeightMm: number;
  /** Fill the filler between the grid and the drawer walls instead of bridging it with bars. */
  solidFiller: boolean;
  /** How far the profile reaches from a crossing along each grid line. */
  nodeArmMm: number;
  connectorHoles: boolean;
  /** Diameter of the holes for the filament pieces that join the parts. */
  connectorHoleMm: number;
  /**
   * Connector holes on the outer edges of the parts too, not only across
   * the seams, so parts printed ahead can be joined in any layout later.
   */
  connectorHolesOnEdges: boolean;
  /**
   * A star-shaped hole through every crossing, for nails or glue: the
   * rounded corners of the four cells around it carried straight down, so
   * only walls of even width stay.
   */
  starHoles: boolean;
  /** Radius of the drawer corners; the outer corners of the baseplate follow it. */
  cornerRadiusMm: number;
  quality: QualityParams;
}

/** One printable part of the baseplate, in drawer coordinates. */
export interface BaseplatePiece {
  /** Column letter (left to right) and row number (front to back). */
  label: string;
  /** Position of the part among the parts, from the front left. */
  column: number;
  row: number;
  /** First grid column and row of the part, and how many it spans. */
  startX: number;
  unitsX: number;
  startY: number;
  unitsY: number;
  /** Flat filler between the grid and the drawer wall on each side. */
  padLeft: number;
  padRight: number;
  padFront: number;
  padBack: number;
  /** Center of the part's outline. */
  centerX: number;
  centerY: number;
  width: number;
  depth: number;
  /** Sides that meet a neighboring part. */
  seamLeft: boolean;
  seamRight: boolean;
  seamFront: boolean;
  seamBack: boolean;
}

/** Height of the Gridfinity receiving profile. */
export const BASEPLATE_PROFILE_HEIGHT_MM = 4.65;
/**
 * The receiving profile as (height, inset from the cell border), bottom to
 * top: a 0.7 mm chamfer, a 1.8 mm straight wall and a 2.15 mm chamfer up to
 * the knife edge on the cell border.
 */
export const BASEPLATE_PROFILE: [number, number][] = [
  [0, 2.85],
  [0.7, 2.15],
  [2.5, 2.15],
  [BASEPLATE_PROFILE_HEIGHT_MM, 0],
];
/** Corner radius of a cell opening at the top of the profile. */
export const BASEPLATE_CELL_RADIUS_MM = 4;
/** Half size of a star hole: its arcs are the top corners of the cells round it. */
export const BASEPLATE_STAR_MM = BASEPLATE_CELL_RADIUS_MM;
/** Material kept around a connector hole inside the profile wall. */
const CONNECTOR_WALL_MM = 0.8;
/** Smallest filler worth printing; narrower rests stay open. */
const MIN_PAD_MM = 0.5;
const MAX_UNITS = 40;
const MAX_CORNER_RADIUS_MM = 30;

const ERROR_BASEPLATE_PLATE_TOO_SMALL =
  'The build plate is too small for one grid unit plus the filler at the drawer walls.';
const ERROR_BASEPLATE_TOO_SMALL = 'The drawer is too small for one Gridfinity unit.';
const ERROR_BASEPLATE_VALUES =
  'Baseplate values are out of range: drawer up to 40 units, bars of 0.4 to 5 mm, node arms from 4 mm up to half a unit, connector holes that leave 0.8 mm of wall in the profile, and corner radii up to 30 mm.';

export function defaultBaseplateParams(): BaseplateParams {
  return {
    drawerWidthMm: 12 * GRID_PITCH_MM + 10,
    drawerDepthMm: 6 * GRID_PITCH_MM + 8,
    clearanceMm: 1,
    alignX: 'center',
    alignY: 'center',
    plateWidthMm: BAMBU_X2D_PLATE_MM,
    plateDepthMm: BAMBU_X2D_PLATE_MM,
    barWidthMm: 1.6,
    barHeightMm: 1.2,
    solidFiller: true,
    nodeArmMm: 8,
    connectorHoles: true,
    connectorHoleMm: 1.9,
    connectorHolesOnEdges: false,
    starHoles: true,
    cornerRadiusMm: BASEPLATE_STAR_MM,
    quality: { chordTolMm: 0.05 },
  };
}

/** Height of the center of a connector hole: it starts on top of the bars. */
export function connectorHoleZ(params: BaseplateParams): number {
  return Math.max(params.barHeightMm, BASEPLATE_PROFILE[1][0]) + params.connectorHoleMm / 2;
}

/** Inset of the cell opening from the cell border at height `z`. */
export function profileInsetAt(z: number): number {
  for (let i = 1; i < BASEPLATE_PROFILE.length; i++) {
    const [z1, inset1] = BASEPLATE_PROFILE[i];
    if (z <= z1) {
      const [z0, inset0] = BASEPLATE_PROFILE[i - 1];
      return inset0 + ((Math.max(z, z0) - z0) / (z1 - z0)) * (inset1 - inset0);
    }
  }
  return 0;
}

interface AxisPlan {
  units: number;
  /** Filler before and after the grid. */
  padStart: number;
  padEnd: number;
  /** Outline from the first to the last wall, centered on zero. */
  span: number;
}

function planAxis(drawerMm: number, clearanceMm: number, align: BaseplateAlign): AxisPlan {
  const span = drawerMm - clearanceMm;
  const units = Math.min(MAX_UNITS, Math.floor(span / GRID_PITCH_MM + 1e-9));
  const rest = span - units * GRID_PITCH_MM;
  const keep = (pad: number) => (pad >= MIN_PAD_MM ? pad : 0);
  if (align === 'start') {
    return { units, padStart: 0, padEnd: keep(rest), span };
  }
  if (align === 'end') {
    return { units, padStart: keep(rest), padEnd: 0, span };
  }
  return { units, padStart: keep(rest / 2), padEnd: keep(rest / 2), span };
}

/**
 * Near-equal part sizes in mirror order, the smaller ones outside so they
 * keep room for the filler: parts that face each other across the drawer
 * then print the same after a half turn. Null when the sizes cannot mirror.
 */
function mirroredParts(count: number, base: number, extra: number): number[] | null {
  const small = count - extra;
  if (small % 2 === 1 && count % 2 === 0) {
    return null;
  }
  const parts = Array.from({ length: count }, () => base + 1);
  for (let i = 0; i < Math.floor(small / 2); i++) {
    parts[i] = base;
    parts[count - 1 - i] = base;
  }
  if (small % 2 === 1) {
    parts[(count - 1) / 2] = base;
  }
  return parts;
}

/** Near-equal part sizes, the two smallest outside. */
function outerSmallParts(count: number, base: number, extra: number): number[] {
  const parts = Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
  parts.sort((a, b) => a - b);
  const outer = [parts.shift() as number, parts.shift() as number];
  return [outer[0], ...parts.sort((a, b) => b - a), outer[1]];
}

/**
 * Splits `units` into the fewest near-equal parts that fit `plateMm`
 * together with the filler on the outer parts, mirrored where possible.
 */
function splitAxis(axis: AxisPlan, plateMm: number): number[] | null {
  const fits = (units: number, pad: number) => units * GRID_PITCH_MM + pad <= plateMm + 1e-9;
  if (fits(axis.units, axis.padStart + axis.padEnd)) {
    return [axis.units];
  }
  for (let count = 2; count <= axis.units; count++) {
    const base = Math.floor(axis.units / count);
    const extra = axis.units - base * count;
    const candidates = [mirroredParts(count, base, extra), outerSmallParts(count, base, extra)];
    for (const parts of candidates) {
      if (
        parts !== null &&
        fits(parts[0], axis.padStart) &&
        fits(parts[parts.length - 1], axis.padEnd) &&
        parts.every((units) => fits(units, 0))
      ) {
        return parts;
      }
    }
  }
  return null;
}

export function planBaseplateAxes(params: BaseplateParams): { x: AxisPlan; y: AxisPlan } {
  return {
    x: planAxis(params.drawerWidthMm, params.clearanceMm, params.alignX),
    y: planAxis(params.drawerDepthMm, params.clearanceMm, params.alignY),
  };
}

/** Splits the drawer into parts that fit the build plate, or null when none fit. */
export function planBaseplate(params: BaseplateParams): BaseplatePiece[] | null {
  const { x, y } = planBaseplateAxes(params);
  if (x.units < 1 || y.units < 1) {
    return null;
  }
  const columns = splitAxis(x, params.plateWidthMm);
  const rows = splitAxis(y, params.plateDepthMm);
  if (columns === null || rows === null) {
    return null;
  }
  const pieces: BaseplatePiece[] = [];
  let startX = 0;
  columns.forEach((unitsX, column) => {
    let startY = 0;
    rows.forEach((unitsY, row) => {
      const first = { x: column === 0, y: row === 0 };
      const last = { x: column === columns.length - 1, y: row === rows.length - 1 };
      const padLeft = first.x ? x.padStart : 0;
      const padRight = last.x ? x.padEnd : 0;
      const padFront = first.y ? y.padStart : 0;
      const padBack = last.y ? y.padEnd : 0;
      const left = -x.span / 2 + x.padStart + startX * GRID_PITCH_MM - padLeft;
      const front = -y.span / 2 + y.padStart + startY * GRID_PITCH_MM - padFront;
      const width = unitsX * GRID_PITCH_MM + padLeft + padRight;
      const depth = unitsY * GRID_PITCH_MM + padFront + padBack;
      pieces.push({
        label: `${String.fromCharCode(65 + column)}${row + 1}`,
        column,
        row,
        startX,
        unitsX,
        startY,
        unitsY,
        padLeft,
        padRight,
        padFront,
        padBack,
        centerX: left + width / 2,
        centerY: front + depth / 2,
        width,
        depth,
        seamLeft: !first.x,
        seamRight: !last.x,
        seamFront: !first.y,
        seamBack: !last.y,
      });
      startY += unitsY;
    });
    startX += unitsX;
  });
  return pieces;
}

export function validateBaseplate(params: BaseplateParams): ValidationIssue[] {
  const profileWall = 2 * BASEPLATE_PROFILE[1][1] - 2 * CONNECTOR_WALL_MM;
  // The pointed top of a connector hole reaches sqrt 2 times its radius up.
  const holeTop = connectorHoleZ(params) + (params.connectorHoleMm / 2) * Math.SQRT2;
  const valid =
    params.drawerWidthMm > 0 &&
    params.drawerDepthMm > 0 &&
    params.drawerWidthMm <= MAX_UNITS * GRID_PITCH_MM + 41 &&
    params.drawerDepthMm <= MAX_UNITS * GRID_PITCH_MM + 41 &&
    params.clearanceMm >= 0 &&
    params.clearanceMm <= 10 &&
    params.barWidthMm >= 0.4 &&
    params.barWidthMm <= 5 &&
    params.barHeightMm >= 0.4 &&
    params.barHeightMm <= BASEPLATE_PROFILE_HEIGHT_MM &&
    params.nodeArmMm >= 4 &&
    params.nodeArmMm <= GRID_PITCH_MM / 2 &&
    params.connectorHoleMm >= 1 &&
    params.connectorHoleMm <= profileWall &&
    holeTop <= BASEPLATE_PROFILE_HEIGHT_MM - CONNECTOR_WALL_MM &&
    params.cornerRadiusMm >= 0 &&
    params.cornerRadiusMm <= MAX_CORNER_RADIUS_MM &&
    params.cornerRadiusMm <= params.drawerWidthMm / 2 &&
    params.cornerRadiusMm <= params.drawerDepthMm / 2;
  if (!valid) {
    return [{ code: 'baseplate-values', message: ERROR_BASEPLATE_VALUES }];
  }
  const { x, y } = planBaseplateAxes(params);
  if (x.units < 1 || y.units < 1) {
    return [{ code: 'baseplate-size', message: ERROR_BASEPLATE_TOO_SMALL }];
  }
  if (planBaseplate(params) === null) {
    return [{ code: 'baseplate-plate', message: ERROR_BASEPLATE_PLATE_TOO_SMALL }];
  }
  return [];
}

/**
 * A key that two parts share exactly when they print the same: equal, or
 * equal after a half turn, since the part geometry is symmetric under it.
 */
export function baseplatePrintKey(piece: BaseplatePiece): string {
  const key = (pads: number[], seams: boolean[]) =>
    `${piece.unitsX}x${piece.unitsY}|${pads.map((pad) => pad.toFixed(6)).join(',')}|${seams.join(',')}`;
  const asIs = key(
    [piece.padLeft, piece.padRight, piece.padFront, piece.padBack],
    [piece.seamLeft, piece.seamRight, piece.seamFront, piece.seamBack],
  );
  const turned = key(
    [piece.padRight, piece.padLeft, piece.padBack, piece.padFront],
    [piece.seamRight, piece.seamLeft, piece.seamBack, piece.seamFront],
  );
  return asIs < turned ? asIs : turned;
}

/** An axis-aligned rectangle in the frame of a part. */
export interface BaseplateRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A horizontal connector hole, centered on (x, y) at `connectorHoleZ`. */
export interface BaseplateConnectorHole {
  x: number;
  y: number;
  length: number;
  alongY: boolean;
}

/** Everything a part is made of, in its own frame centered on its outline. */
export interface BaseplateLayout {
  /** Flat bars and solid filler, `barHeightMm` high. */
  bars: BaseplateRect[];
  /** The grid area that carries the receiving profile. */
  grid: BaseplateRect;
  /** Grid line crossings, with the profile within `nodeArmMm` of them. */
  crossings: [number, number][];
  /**
   * Crossings that take a star hole: all but those on a grid edge with
   * filler beyond it, where the hole would leave a notch against the filler.
   */
  starCrossings: [number, number][];
  /**
   * Outer corners of the drawer that fall on this part: the corner point,
   * the directions pointing into the part, and the lower left corner of
   * the grid cell next to it.
   */
  corners: { x: number; y: number; dx: number; dy: number; cell: [number, number] }[];
  /** Lower left corners of the grid cells. */
  cells: [number, number][];
  connectorHoles: BaseplateConnectorHole[];
}

/** Overshoot of cutters past the faces they open. */
export const BASEPLATE_CUT_MM = 1;

/**
 * Bar span across a line at `at` within [lo, hi]: centered on inner lines,
 * kept inside the part on its edges so seams and walls get full bars.
 */
function barSpan(at: number, lo: number, hi: number, width: number): [number, number] {
  if (Math.abs(at - lo) < 1e-6) {
    return [lo, lo + width];
  }
  if (Math.abs(at - hi) < 1e-6) {
    return [hi - width, hi];
  }
  return [at - width / 2, at + width / 2];
}

/**
 * The layout of one part: flat bars along every grid line, carried on
 * across the filler to the drawer walls and along the walls wherever
 * there is filler; the profile around the crossings; and the connector
 * holes across every seam, or every edge when asked, through the half
 * nodes on it. Crossings at the ends of an edge get no connector: there
 * the hole would run along another edge.
 */
export function baseplateLayout(params: BaseplateParams, piece: BaseplatePiece): BaseplateLayout {
  const left = -piece.width / 2;
  const right = piece.width / 2;
  const front = -piece.depth / 2;
  const back = piece.depth / 2;
  const gridLeft = left + piece.padLeft;
  const gridFront = front + piece.padFront;
  const grid = {
    x0: gridLeft,
    x1: gridLeft + piece.unitsX * GRID_PITCH_MM,
    y0: gridFront,
    y1: gridFront + piece.unitsY * GRID_PITCH_MM,
  };
  const xs = Array.from({ length: piece.unitsX + 1 }, (_, i) => gridLeft + i * GRID_PITCH_MM);
  const ys = Array.from({ length: piece.unitsY + 1 }, (_, j) => gridFront + j * GRID_PITCH_MM);
  const barXs = [
    ...xs,
    ...(piece.padLeft > 0 ? [left] : []),
    ...(piece.padRight > 0 ? [right] : []),
  ];
  const barYs = [
    ...ys,
    ...(piece.padFront > 0 ? [front] : []),
    ...(piece.padBack > 0 ? [back] : []),
  ];
  const width = params.barWidthMm;
  // Solid filler: the strips between the grid and the walls, at bar height.
  const filler: BaseplateRect[] = !params.solidFiller
    ? []
    : [
        ...(piece.padLeft > 0 ? [{ x0: left, x1: gridLeft, y0: front, y1: back }] : []),
        ...(piece.padRight > 0 ? [{ x0: grid.x1, x1: right, y0: front, y1: back }] : []),
        ...(piece.padFront > 0 ? [{ x0: left, x1: right, y0: front, y1: gridFront }] : []),
        ...(piece.padBack > 0 ? [{ x0: left, x1: right, y0: grid.y1, y1: back }] : []),
      ];
  const bars: BaseplateRect[] = [
    ...filler,
    ...barXs.map((x) => {
      const [x0, x1] = barSpan(x, left, right, width);
      return { x0, x1, y0: front, y1: back };
    }),
    ...barYs.map((y) => {
      const [y0, y1] = barSpan(y, front, back, width);
      return { x0: left, x1: right, y0, y1 };
    }),
  ];
  // Through the arm and its sloped end, so the filament goes in from the open cell.
  const armBase = params.nodeArmMm + BASEPLATE_PROFILE_HEIGHT_MM;
  const length = armBase + 2 * BASEPLATE_CUT_MM;
  const reach = armBase / 2;
  const inner = (lines: number[]) => lines.slice(1, -1);
  const connectorHoles: BaseplateConnectorHole[] = [];
  if (piece.seamLeft || params.connectorHolesOnEdges) {
    connectorHoles.push(
      ...inner(ys).map((y) => ({ x: grid.x0 + reach, y, length, alongY: false })),
    );
  }
  if (piece.seamRight || params.connectorHolesOnEdges) {
    connectorHoles.push(
      ...inner(ys).map((y) => ({ x: grid.x1 - reach, y, length, alongY: false })),
    );
  }
  if (piece.seamFront || params.connectorHolesOnEdges) {
    connectorHoles.push(...inner(xs).map((x) => ({ x, y: grid.y0 + reach, length, alongY: true })));
  }
  if (piece.seamBack || params.connectorHolesOnEdges) {
    connectorHoles.push(...inner(xs).map((x) => ({ x, y: grid.y1 - reach, length, alongY: true })));
  }
  const crossings = xs.flatMap((x) => ys.map((y): [number, number] => [x, y]));
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const againstFiller = (x: number, y: number) =>
    (piece.padLeft > 0 && near(x, grid.x0)) ||
    (piece.padRight > 0 && near(x, grid.x1)) ||
    (piece.padFront > 0 && near(y, grid.y0)) ||
    (piece.padBack > 0 && near(y, grid.y1));
  const corner = (x: number, y: number, dx: number, dy: number) => ({
    x,
    y,
    dx,
    dy,
    cell: [
      dx > 0 ? grid.x0 : grid.x1 - GRID_PITCH_MM,
      dy > 0 ? grid.y0 : grid.y1 - GRID_PITCH_MM,
    ] as [number, number],
  });
  return {
    bars,
    grid,
    crossings,
    starCrossings: crossings.filter(([x, y]) => !againstFiller(x, y)),
    cells: xs.slice(0, -1).flatMap((x) => ys.slice(0, -1).map((y): [number, number] => [x, y])),
    connectorHoles,
    corners: [
      ...(!piece.seamLeft && !piece.seamFront ? [corner(left, front, 1, 1)] : []),
      ...(!piece.seamRight && !piece.seamFront ? [corner(right, front, -1, 1)] : []),
      ...(!piece.seamLeft && !piece.seamBack ? [corner(left, back, 1, -1)] : []),
      ...(!piece.seamRight && !piece.seamBack ? [corner(right, back, -1, -1)] : []),
    ],
  };
}
