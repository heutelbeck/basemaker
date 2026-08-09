import { halfExtents, resolveShape } from './shapeMetrics.ts';
import type { QualityParams, ShapeSpec } from './types.ts';
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
 * Unit movement tray: a formation of pockets holding individual bases,
 * with an outer rim and an optional sheet inlay underneath. Rotated
 * pockets turn the base 90 degrees, e.g. cavalry bases standing 25 mm
 * wide by 50 mm deep.
 */
export interface MovementTrayParams {
  pocketShape: ShapeSpec;
  pocketRotated: boolean;
  formation: TrayFormation;
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
    rows: 1,
    cols: 5,
    clearance: 0.2,
    gap: 0,
    rim: 3,
    pocketDepth: 2.5,
    floor: 1.2,
    edgeSlope: 1,
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
    edgeSlope: 0,
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

function commonTrayIssues(params: TrayCommon, gap: number): ValidationIssue[] {
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
  if (params.edgeSlope < 0 || (params.edgeSlope > 0 && params.edgeSlope >= params.rim)) {
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
  return commonTrayIssues(params, params.gap);
}

export function validateAdapterTray(params: AdapterTrayParams): ValidationIssue[] {
  const issues = commonTrayIssues(params, 0);
  const donor = halfExtents(resolveShape(params.donor));
  const target = halfExtents(resolveShape(params.target));
  if (donor.hx + params.clearance > target.hx || donor.hy + params.clearance > target.hy) {
    issues.push({ code: 'tray-cell', message: ERROR_TRAY_CELL_TOO_SMALL });
  }
  return issues;
}
