import { magnetCentersInOutline } from './magnetLayout.ts';
import type { Vec } from './polygon.ts';
import { polygonContains } from './polygon.ts';
import { halfExtents, resolveShape } from './shapeMetrics.ts';
import type { Point2 } from './tessellation.ts';
import { rectOutline } from './tessellation.ts';
import type { MagnetParams, QualityParams, ShapeSpec } from './types.ts';
import { towEdgeSlopeFor } from './types.ts';
import type { ValidationIssue } from './validate.ts';
import { magnetSlotIssues } from './validate.ts';

/**
 * Recess for a magnetic or metal sheet. Underside placement holds one
 * continuous hidden sheet below the floor; pocket placement recesses each
 * pocket floor so cut sheet pieces sit directly under the bases for the
 * strongest magnet hold (the inset only applies to underside placement).
 */
export interface SheetInlayParams {
  depth: number;
  inset: number;
  placement: 'underside' | 'pockets';
}

/**
 * Pocket arrangement. Grid is the classic ranked block; lance staggers
 * each column back from the center column into the Bretonnian wedge;
 * skirmish offsets alternate rows by half a pitch for loose formations.
 */
export type TrayFormation = 'grid' | 'lance' | 'skirmish';

/**
 * Tray construction style. Solid trays are the classic plate with pockets;
 * skeleton trays are floorless collars around each base, connected where
 * the rings merge; honeycomb trays are a thin silhouette plate whose floor
 * is perforated by a hex lattice inside a solid border band.
 */
export type TrayStyle = 'solid' | 'skeleton' | 'honeycomb';

/**
 * Unit movement tray: a formation of pockets holding individual bases,
 * with an outer rim and an optional sheet inlay underneath. Rotated
 * pockets turn the base 90 degrees, e.g. cavalry bases standing 25 mm
 * wide by 50 mm deep.
 */
/**
 * Bottom accent layer printed in a second color: it spans the tray's
 * footprint dilated by `outsetMm`, so it shows as a contour band around
 * the silhouette and peeks into every opening.
 */
export interface TrayAccent {
  colorHex: string;
  layerMm: number;
  outsetMm: number;
  placement: 'top' | 'bottom' | 'both';
}

export interface MovementTrayParams {
  pocketShape: ShapeSpec;
  pocketRotated: boolean;
  formation: TrayFormation;
  style: TrayStyle;
  webCellMm: number;
  webStrutMm: number;
  accent: TrayAccent | null;
  rows: number;
  cols: number;
  clearance: number;
  gap: number;
  rim: number;
  pocketDepth: number;
  floor: number;
  edgeSlope: number;
  sheetInlay: SheetInlayParams | null;
  magnets: MagnetParams | null;
  quality: QualityParams;
}

/**
 * Adapter tray: converts ranked units based for one game edition to the
 * footprint of another. The tray occupies exactly rows x cols cells of the
 * target base size (plus an optional extra rim); each cell holds a pocket
 * for a donor base.
 */
export interface AdapterTrayParams {
  donor: ShapeSpec;
  target: ShapeSpec;
  rows: number;
  cols: number;
  clearance: number;
  rim: number;
  pocketDepth: number;
  floor: number;
  edgeSlope: number;
  cellMarkers: boolean;
  sheetInlay: SheetInlayParams | null;
  magnets: MagnetParams | null;
  quality: QualityParams;
}

export function defaultMovementTrayParams(): MovementTrayParams {
  return {
    pocketShape: { kind: 'square', size: 25 },
    pocketRotated: false,
    formation: 'grid',
    style: 'solid',
    webCellMm: 4,
    webStrutMm: 1.2,
    accent: null,
    rows: 1,
    cols: 5,
    clearance: 0.2,
    gap: 0,
    rim: 3,
    pocketDepth: 2.5,
    floor: 1.2,
    edgeSlope: towEdgeSlopeFor(2.5 + 1.2),
    sheetInlay: null,
    magnets: null,
    quality: { chordTolMm: 0.02 },
  };
}

export function defaultAdapterTrayParams(): AdapterTrayParams {
  return {
    donor: { kind: 'square', size: 20 },
    target: { kind: 'square', size: 25 },
    rows: 1,
    cols: 5,
    clearance: 0.2,
    rim: 0,
    pocketDepth: 2.5,
    floor: 1.2,
    edgeSlope: towEdgeSlopeFor(2.5 + 1.2),
    cellMarkers: false,
    sheetInlay: null,
    magnets: null,
    quality: { chordTolMm: 0.02 },
  };
}

const ERROR_TRAY_CELL_TOO_SMALL =
  'The donor base plus clearance does not fit inside one target cell.';
/**
 * Default tray magnets: 6 x 2 mm discs spread evenly over the underside,
 * one per five bases, so the loaded tray holds to a steel transport sheet.
 */
export function defaultTrayMagnets(pocketCount: number): MagnetParams {
  return {
    shape: 'round',
    layout: 'even',
    diameter: 6,
    length: 5,
    width: 5,
    depth: 2,
    count: Math.max(1, Math.round(pocketCount / 5)),
    spacing: 30,
    offsetX: 0,
    offsetY: 0,
    padding: 0.8,
  };
}

/** Number of bases a movement tray holds. */
export function movementTrayPocketCount(params: MovementTrayParams): number {
  return params.formation === 'lance'
    ? (params.rows * (params.rows + 1)) / 2
    : params.rows * params.cols;
}

/** Cell center positions of a rows x cols grid centered on the origin. */
export function cellCenters(layout: {
  rows: number;
  cols: number;
  pitchX: number;
  pitchY: number;
}): Point2[] {
  const centers: Point2[] = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      centers.push([
        (col - (layout.cols - 1) / 2) * layout.pitchX,
        (row - (layout.rows - 1) / 2) * layout.pitchY,
      ]);
    }
  }
  return centers;
}

/**
 * Formation-aware cell centers. Lance is the official Bretonnian wedge:
 * rank r holds r + 1 bases, each rank centered, front rank first - `rows`
 * is the number of ranks, `cols` is ignored. Skirmish shifts alternate
 * rows by half a pitch.
 */
export function formationCenters(
  formation: TrayFormation,
  rows: number,
  cols: number,
  pitchX: number,
  pitchY: number,
): Point2[] {
  const centers: Point2[] = [];
  if (formation === 'lance') {
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i <= row; i++) {
        centers.push([(i - row / 2) * pitchX, ((rows - 1) / 2 - row) * pitchY]);
      }
    }
    return centers;
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x = (col - (cols - 1) / 2) * pitchX;
      const y = (row - (rows - 1) / 2) * pitchY;
      if (formation === 'skirmish' && row % 2 === 1) {
        x += pitchX / 2;
      }
      centers.push([x, y]);
    }
  }
  return centers;
}

/**
 * One convex rectangle per rank, hugging that rank's cells plus the rim.
 * Real stepped trays (GW, LITKO) follow the staggered ranks exactly; a
 * convex hull would bridge the steps with diagonals and ruin base-to-base
 * contact, so the tray body is the union of these per-rank frustums.
 */
export function rankRects(
  centers: Point2[],
  cellHx: number,
  cellHy: number,
  rim: number,
): Point2[][] {
  const byRow = new Map<number, Point2[]>();
  for (const center of centers) {
    const key = Math.round(center[1] * 1000);
    const row = byRow.get(key);
    if (row === undefined) {
      byRow.set(key, [center]);
    } else {
      row.push(center);
    }
  }
  const rects: Point2[][] = [];
  for (const row of byRow.values()) {
    const xs = row.map(([x]) => x);
    const y = row[0][1];
    const minX = Math.min(...xs) - cellHx - rim;
    const maxX = Math.max(...xs) + cellHx + rim;
    const minY = y - cellHy - rim;
    const maxY = y + cellHy + rim;
    rects.push([
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ]);
  }
  return rects;
}

/** Pocket cell geometry of a movement tray: half sizes, pitch, and centers. */
export function movementTrayCells(params: MovementTrayParams): {
  phx: number;
  phy: number;
  pitchX: number;
  pitchY: number;
  centers: Point2[];
} {
  const extents = halfExtents(resolveShape(params.pocketShape));
  const phx = (params.pocketRotated ? extents.hy : extents.hx) + params.clearance;
  const phy = (params.pocketRotated ? extents.hx : extents.hy) + params.clearance;
  const pitchX = 2 * phx + params.gap;
  const pitchY = 2 * phy + params.gap;
  const centers = formationCenters(params.formation, params.rows, params.cols, pitchX, pitchY);
  return { phx, phy, pitchX, pitchY, centers };
}

/**
 * Outer contour of a stack of rank rectangles. Ranks are horizontal
 * bands whose x-extent is a single interval at every height, so the
 * union is traced up the right side and back down the left side.
 */
function rankUnionOutline(rects: Point2[][]): Vec[] {
  const ys = [...new Set(rects.flatMap((rect) => [rect[0][1], rect[2][1]]))].sort((a, b) => a - b);
  const slabs: { y0: number; y1: number; minX: number; maxX: number }[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const mid = (ys[i] + ys[i + 1]) / 2;
    const covering = rects.filter((rect) => rect[0][1] <= mid && mid <= rect[2][1]);
    if (covering.length > 0) {
      slabs.push({
        y0: ys[i],
        y1: ys[i + 1],
        minX: Math.min(...covering.map((rect) => rect[0][0])),
        maxX: Math.max(...covering.map((rect) => rect[2][0])),
      });
    }
  }
  const right = slabs.flatMap((slab): Vec[] => [
    [slab.maxX, slab.y0],
    [slab.maxX, slab.y1],
  ]);
  const left = [...slabs].reverse().flatMap((slab): Vec[] => [
    [slab.minX, slab.y1],
    [slab.minX, slab.y0],
  ]);
  return [...right, ...left];
}

/** Bottom footprint of a solid movement tray. */
export function movementTrayOutline(params: MovementTrayParams): Vec[] {
  const { phx, phy, pitchX, pitchY, centers } = movementTrayCells(params);
  if (params.formation === 'grid') {
    return rectOutline(
      (params.cols * pitchX - params.gap) / 2 + params.rim,
      (params.rows * pitchY - params.gap) / 2 + params.rim,
    );
  }
  return rankUnionOutline(rankRects(centers, phx, phy, params.rim));
}

/** Bottom footprint of an adapter tray. */
export function adapterTrayOutline(params: AdapterTrayParams): Vec[] {
  const target = halfExtents(resolveShape(params.target));
  return rectOutline(params.cols * target.hx + params.rim, params.rows * target.hy + params.rim);
}

/**
 * Magnet slot centers on a tray underside. The sloped edge counts as
 * extra margin so slots keep their padding to the outer wall.
 */
export function trayMagnetCenters(
  magnets: MagnetParams,
  outline: Vec[],
  edgeSlope: number,
): Point2[] {
  return magnetCentersInOutline(magnets, outline, edgeSlope);
}

const ERROR_TRAY_COUNTS_INVALID = 'The tray rows and columns must be whole numbers of at least 1.';
const ERROR_TRAY_EDGE_SLOPE_INVALID =
  'The tray edge slope must not be negative and must stay below the rim width.';
const ERROR_TRAY_HEIGHTS_INVALID = 'The tray pocket depth and floor thickness must be positive.';
const ERROR_TRAY_INLAY_TOO_DEEP = 'The sheet inlay must be shallower than the tray floor.';
const ERROR_TRAY_MAGNET_FIT =
  'A tray magnet slot including its padding does not fit inside the tray footprint.';
const ERROR_TRAY_MAGNET_TOO_DEEP =
  'The tray magnet slots must not be deeper than the floor below the pockets and any sheet recess.';
const ERROR_TRAY_MAGNET_UNDERSIDE_SHEET =
  'Tray magnet slots and an underside sheet inlay share the bottom layer; place the sheet in the pocket floors instead.';
const ERROR_TRAY_MAGNET_WEB =
  'Tray magnet slots need a solid tray floor; switch the tray style to solid pockets.';
const ERROR_TRAY_INLAY_VALUES_INVALID =
  'The sheet inlay depth must be positive and the inset must not be negative.';
const ERROR_TRAY_ACCENT_INVALID =
  'The accent layer must be at least 0.2 mm, thinner than the floor, with an outset between 0 and 3 mm.';
const ERROR_TRAY_WEB_DISCONNECTED =
  'Honeycomb trays need the ring walls to touch: the gap must be smaller than twice the rim.';
const ERROR_TRAY_WEB_NO_INLAY =
  'Sheet inlays need a solid tray floor; switch the tray style to solid pockets.';
const ERROR_TRAY_WEB_VALUES_INVALID =
  'The honeycomb cell must be at least 2 mm and the strut at least 0.8 mm and smaller than the cell.';
const ERROR_TRAY_VALUES_NEGATIVE = 'The tray clearance, gap, and rim must not be negative.';

interface TrayCommon {
  rows: number;
  cols: number;
  clearance: number;
  rim: number;
  pocketDepth: number;
  floor: number;
  edgeSlope: number;
  sheetInlay: SheetInlayParams | null;
  magnets: MagnetParams | null;
}

/**
 * Deepest magnet slot the floor allows: the floor below the pockets minus
 * any pocket sheet recess. A slot of exactly this depth opens into the
 * pocket or recess above it, so the magnet touches the sheet directly.
 */
export function trayMagnetDepthBudget(params: {
  floor: number;
  sheetInlay: SheetInlayParams | null;
}): number {
  const sheetDepth = params.sheetInlay?.placement === 'pockets' ? params.sheetInlay.depth : 0;
  return params.floor - sheetDepth;
}

function trayMagnetIssues(params: TrayCommon, outline: Vec[]): ValidationIssue[] {
  const magnets = params.magnets;
  if (magnets === null) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  const centers = trayMagnetCenters(magnets, outline, params.edgeSlope);
  const slotIssues = magnetSlotIssues(magnets, centers, (x, y) =>
    polygonContains(outline, x, y, params.edgeSlope),
  );
  issues.push(
    ...slotIssues.map((issue) =>
      issue.code === 'magnet-fit' ? { ...issue, message: ERROR_TRAY_MAGNET_FIT } : issue,
    ),
  );
  if (params.sheetInlay?.placement === 'underside') {
    issues.push({ code: 'tray-magnet-sheet', message: ERROR_TRAY_MAGNET_UNDERSIDE_SHEET });
  }
  if (magnets.depth > trayMagnetDepthBudget(params) + 1e-9) {
    issues.push({ code: 'tray-magnet-depth', message: ERROR_TRAY_MAGNET_TOO_DEEP });
  }
  return issues;
}

function commonTrayIssues(params: TrayCommon, gap: number, slopeBudget: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const counts = [params.rows, params.cols];
  if (counts.some((count) => !Number.isInteger(count) || count < 1)) {
    issues.push({ code: 'tray-counts', message: ERROR_TRAY_COUNTS_INVALID });
  }
  if (params.clearance < 0 || gap < 0 || params.rim < 0) {
    issues.push({ code: 'tray-values', message: ERROR_TRAY_VALUES_NEGATIVE });
  }
  if (!(params.pocketDepth > 0) || !(params.floor > 0)) {
    issues.push({ code: 'tray-heights', message: ERROR_TRAY_HEIGHTS_INVALID });
  }
  if (params.edgeSlope < 0 || (params.edgeSlope > 0 && params.edgeSlope >= slopeBudget)) {
    issues.push({ code: 'tray-edge-slope', message: ERROR_TRAY_EDGE_SLOPE_INVALID });
  }
  if (params.sheetInlay !== null) {
    if (!(params.sheetInlay.depth > 0) || params.sheetInlay.inset < 0) {
      issues.push({ code: 'tray-inlay-values', message: ERROR_TRAY_INLAY_VALUES_INVALID });
    } else if (params.sheetInlay.depth >= params.floor) {
      issues.push({ code: 'tray-inlay-depth', message: ERROR_TRAY_INLAY_TOO_DEEP });
    }
  }
  return issues;
}

export function validateMovementTray(params: MovementTrayParams): ValidationIssue[] {
  const issues = commonTrayIssues(
    params,
    params.gap,
    params.style === 'solid' ? params.rim : Infinity,
  );
  if (params.style === 'honeycomb' && params.gap >= 2 * params.rim) {
    issues.push({ code: 'tray-web-gap', message: ERROR_TRAY_WEB_DISCONNECTED });
  }
  if (params.style !== 'solid' && params.sheetInlay !== null) {
    issues.push({ code: 'tray-web-inlay', message: ERROR_TRAY_WEB_NO_INLAY });
  }
  if (params.style !== 'solid' && params.magnets !== null) {
    issues.push({ code: 'tray-web-magnets', message: ERROR_TRAY_MAGNET_WEB });
  } else if (issues.length === 0) {
    issues.push(...trayMagnetIssues(params, movementTrayOutline(params)));
  }
  if (
    params.style === 'honeycomb' &&
    (!(params.webCellMm >= 2) ||
      !(params.webStrutMm >= 0.8) ||
      params.webStrutMm >= params.webCellMm)
  ) {
    issues.push({ code: 'tray-web-values', message: ERROR_TRAY_WEB_VALUES_INVALID });
  }
  if (
    params.accent !== null &&
    (!(params.accent.layerMm >= 0.2) ||
      params.accent.layerMm >= params.floor ||
      params.accent.outsetMm < 0 ||
      params.accent.outsetMm > 3)
  ) {
    issues.push({ code: 'tray-accent-values', message: ERROR_TRAY_ACCENT_INVALID });
  }
  return issues;
}

export function validateAdapterTray(params: AdapterTrayParams): ValidationIssue[] {
  const donor = halfExtents(resolveShape(params.donor));
  const target = halfExtents(resolveShape(params.target));
  const cellMargin = Math.max(
    0,
    Math.min(target.hx - donor.hx, target.hy - donor.hy) - params.clearance,
  );
  const issues = commonTrayIssues(params, 0, params.rim + cellMargin);
  if (donor.hx + params.clearance > target.hx || donor.hy + params.clearance > target.hy) {
    issues.push({ code: 'tray-cell', message: ERROR_TRAY_CELL_TOO_SMALL });
  }
  if (issues.length === 0) {
    issues.push(...trayMagnetIssues(params, adapterTrayOutline(params)));
  }
  return issues;
}
