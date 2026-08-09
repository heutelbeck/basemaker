import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { computeEdgeProfile } from '../params/edgeProfile.ts';
import { convexHull } from '../params/polygon.ts';
import { halfExtents, resolveShape } from '../params/shapeMetrics.ts';
import type {
  AdapterTrayParams,
  MovementTrayParams,
  SheetInlayParams,
  TrayFormation,
} from '../params/trays.ts';
import { withGeometryScope } from './dispose.ts';
import type { Track } from './dispose.ts';
import { CUT_EPSILON, buildShellSolid, shellOutlines } from './features/shell.ts';
import { insetOutline, outsetOutline } from './outlines.ts';
import type { Point2 } from './tessellation.ts';
import { outlineFor, rectOutline } from './tessellation.ts';

const ERROR_INVALID_TRAY = 'The generated tray is not a valid manifold: ';

/** Engraved score line marking target cell boundaries on adapter trays. */
const MARKER_WIDTH = 0.4;
const MARKER_DEPTH = 0.3;

interface CellMarkerPlan {
  rows: number;
  cols: number;
  pitchX: number;
  pitchY: number;
  spanX: number;
  spanY: number;
}

interface TrayLayout {
  pocketOutline: Point2[];
  centers: Point2[];
  shellOutline: Point2[];
  pocketDepth: number;
  floor: number;
  edgeSlope: number;
  markers: CellMarkerPlan | null;
  sheetInlay: SheetInlayParams | null;
}

/** Sharp corners for rectangular pockets, arcs for curved shapes. */
function pocketJoin(kind: string): 'Round' | 'Miter' {
  return kind === 'square' || kind === 'rect' ? 'Miter' : 'Round';
}

function rotateOutline(outline: Point2[]): Point2[] {
  return outline.map(([x, y]) => [-y, x] as Point2);
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
 * Formation-aware cell centers. Lance staggers each column back by half a
 * cell per step away from the center column, forming the Bretonnian
 * wedge; skirmish shifts alternate rows by half a pitch.
 */
export function formationCenters(
  formation: TrayFormation,
  rows: number,
  cols: number,
  pitchX: number,
  pitchY: number,
): Point2[] {
  const centers: Point2[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x = (col - (cols - 1) / 2) * pitchX;
      let y = (row - (rows - 1) / 2) * pitchY;
      if (formation === 'lance') {
        y += Math.abs(col - (cols - 1) / 2) * (pitchY / 2);
      } else if (formation === 'skirmish' && row % 2 === 1) {
        x += pitchX / 2;
      }
      centers.push([x, y]);
    }
  }
  return centers;
}

/** Convex outline hugging all formation cells, before the rim is added. */
export function formationHull(centers: Point2[], cellHx: number, cellHy: number): Point2[] {
  const corners: Point2[] = [];
  for (const [x, y] of centers) {
    corners.push(
      [x - cellHx, y - cellHy],
      [x + cellHx, y - cellHy],
      [x + cellHx, y + cellHy],
      [x - cellHx, y + cellHy],
    );
  }
  return convexHull(corners);
}

export function buildMovementTray(wasm: ManifoldToplevel, params: MovementTrayParams): Manifold {
  const tol = params.quality.chordTolMm;
  const pocket = resolveShape(params.pocketShape);
  const extents = halfExtents(pocket);
  const phx = (params.pocketRotated ? extents.hy : extents.hx) + params.clearance;
  const phy = (params.pocketRotated ? extents.hx : extents.hy) + params.clearance;
  const baseOutline = outlineFor(pocket, tol);
  const orientedOutline = params.pocketRotated ? rotateOutline(baseOutline) : baseOutline;
  const pocketOutline = outsetOutline(
    wasm,
    orientedOutline,
    params.clearance,
    tol,
    pocketJoin(params.pocketShape.kind),
  );
  const pitchX = 2 * phx + params.gap;
  const pitchY = 2 * phy + params.gap;
  const centers = formationCenters(params.formation, params.rows, params.cols, pitchX, pitchY);
  const shellOutline =
    params.formation === 'grid'
      ? rectOutline(
          (params.cols * pitchX - params.gap) / 2 + params.rim,
          (params.rows * pitchY - params.gap) / 2 + params.rim,
        )
      : (outsetOutline(
          wasm,
          formationHull(centers, phx + params.gap / 2, phy + params.gap / 2),
          params.rim,
          tol,
        ));
  return buildTray(wasm, {
    pocketOutline,
    centers,
    shellOutline,
    pocketDepth: params.pocketDepth,
    floor: params.floor,
    edgeSlope: params.edgeSlope,
    markers: null,
    sheetInlay: params.sheetInlay,
  });
}

export function buildAdapterTray(wasm: ManifoldToplevel, params: AdapterTrayParams): Manifold {
  const tol = params.quality.chordTolMm;
  const donor = resolveShape(params.donor);
  const target = halfExtents(resolveShape(params.target));
  const pocketOutline = outsetOutline(
    wasm,
    outlineFor(donor, tol),
    params.clearance,
    tol,
    pocketJoin(params.donor.kind),
  );
  const pitchX = 2 * target.hx;
  const pitchY = 2 * target.hy;
  const spanX = params.cols * pitchX + 2 * params.rim;
  const spanY = params.rows * pitchY + 2 * params.rim;
  return buildTray(wasm, {
    pocketOutline,
    centers: cellCenters({ rows: params.rows, cols: params.cols, pitchX, pitchY }),
    shellOutline: rectOutline(spanX / 2, spanY / 2),
    pocketDepth: params.pocketDepth,
    floor: params.floor,
    edgeSlope: params.edgeSlope,
    markers: params.cellMarkers
      ? { rows: params.rows, cols: params.cols, pitchX, pitchY, spanX, spanY }
      : null,
    sheetInlay: params.sheetInlay,
  });
}

function buildTray(wasm: ManifoldToplevel, layout: TrayLayout): Manifold {
  return withGeometryScope((track) => {
    const height = layout.floor + layout.pocketDepth;
    const profile = computeEdgeProfile(height, layout.edgeSlope, 0, 0.02);
    const outlines = shellOutlines(wasm, layout.shellOutline, profile);
    const shell = buildShellSolid(wasm, track, outlines, profile);
    const cutters = pocketCutters(wasm, track, layout, height);
    if (layout.sheetInlay !== null) {
      if (layout.sheetInlay.placement === 'pockets') {
        cutters.push(...pocketInlayCutters(wasm, track, layout, layout.sheetInlay));
      } else {
        cutters.push(sheetInlayCutter(wasm, track, layout, layout.sheetInlay));
      }
    }
    if (layout.markers !== null) {
      cutters.push(...cellMarkerCutters(wasm, track, layout.markers, height));
    }
    const tray = track(wasm.Manifold.difference([shell, ...cutters]));
    const status = tray.status();
    if (status !== 'NoError') {
      throw new Error(`${ERROR_INVALID_TRAY}${status}.`);
    }
    return tray;
  });
}

function pocketCutters(
  wasm: ManifoldToplevel,
  track: Track,
  layout: TrayLayout,
  height: number,
): Manifold[] {
  return layout.centers.map(([x, y]) => {
    const prism = track(
      wasm.Manifold.extrude([layout.pocketOutline], layout.pocketDepth + CUT_EPSILON),
    );
    return track(prism.translate(x, y, height - layout.pocketDepth));
  });
}

/** Recesses below each pocket floor for per-base sheet pieces. */
function pocketInlayCutters(
  wasm: ManifoldToplevel,
  track: Track,
  layout: TrayLayout,
  inlay: SheetInlayParams,
): Manifold[] {
  return layout.centers.map(([x, y]) => {
    const prism = track(wasm.Manifold.extrude([layout.pocketOutline], inlay.depth + CUT_EPSILON));
    return track(prism.translate(x, y, layout.floor - inlay.depth));
  });
}

/** Score lines on the top face along internal cell boundaries. */
function cellMarkerCutters(
  wasm: ManifoldToplevel,
  track: Track,
  markers: CellMarkerPlan,
  height: number,
): Manifold[] {
  const cutters: Manifold[] = [];
  const groove = (sizeX: number, sizeY: number, x: number, y: number) => {
    const box = track(wasm.Manifold.cube([sizeX, sizeY, MARKER_DEPTH + CUT_EPSILON], true));
    return track(box.translate(x, y, height - MARKER_DEPTH / 2 + CUT_EPSILON / 2));
  };
  for (let col = 1; col < markers.cols; col++) {
    const x = (col - markers.cols / 2) * markers.pitchX;
    cutters.push(groove(MARKER_WIDTH, markers.spanY, x, 0));
  }
  for (let row = 1; row < markers.rows; row++) {
    const y = (row - markers.rows / 2) * markers.pitchY;
    cutters.push(groove(markers.spanX, MARKER_WIDTH, 0, y));
  }
  return cutters;
}

function sheetInlayCutter(
  wasm: ManifoldToplevel,
  track: Track,
  layout: TrayLayout,
  inlay: SheetInlayParams,
): Manifold {
  const outline = insetOutline(wasm, layout.shellOutline, inlay.inset);
  const prism = track(wasm.Manifold.extrude([outline], inlay.depth + CUT_EPSILON));
  return track(prism.translate(0, 0, -CUT_EPSILON));
}
