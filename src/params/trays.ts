import { halfExtents, resolveShape } from './shapeMetrics.ts';
import type { QualityParams, ShapeSpec } from './types.ts';
import { towEdgeSlopeFor } from './types.ts';
import type { ValidationIssue } from './validate.ts';

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
    quality: { chordTolMm: 0.02 },
  };
}

const ERROR_TRAY_CELL_TOO_SMALL =
  'The donor base plus clearance does not fit inside one target cell.';
const ERROR_TRAY_COUNTS_INVALID = 'The tray rows and columns must be whole numbers of at least 1.';
const ERROR_TRAY_EDGE_SLOPE_INVALID =
  'The tray edge slope must not be negative and must stay below the rim width.';
const ERROR_TRAY_HEIGHTS_INVALID = 'The tray pocket depth and floor thickness must be positive.';
const ERROR_TRAY_INLAY_TOO_DEEP = 'The sheet inlay must be shallower than the tray floor.';
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
}

function commonTrayIssues(
  params: TrayCommon,
  gap: number,
  slopeBudget: number,
): ValidationIssue[] {
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
  if (
    params.style === 'honeycomb' &&
    (!(params.webCellMm >= 2) || !(params.webStrutMm >= 0.8) || params.webStrutMm >= params.webCellMm)
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
  return issues;
}
