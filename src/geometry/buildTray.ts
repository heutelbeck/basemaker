import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { computeEdgeProfile } from '../params/edgeProfile.ts';
import { halfExtents, resolveShape } from '../params/shapeMetrics.ts';
import type {
  AdapterTrayParams,
  MovementTrayParams,
  SheetInlayParams,
  TrayAccent,
  TrayFormation,
} from '../params/trays.ts';
import { withGeometryScope } from './dispose.ts';
import type { Track } from './dispose.ts';
import { CUT_EPSILON, buildShellSolid, shellOutlines } from './features/shell.ts';
import { convexHull } from '../params/polygon.ts';
import { insetOutline, outsetOutline } from './outlines.ts';
import type { Point2 } from '../params/tessellation.ts';
import { hexOutline, outlineFor, rectOutline } from '../params/tessellation.ts';

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
  shellPieces: Point2[][] | null;
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

/**
 * The tray split into its printable parts: the body above the accent
 * layer, and the bottom accent slab - the tray's bottom cross-section
 * dilated by the accent outset - which shows as a contour band around
 * the silhouette and peeks into every opening. Callers own both solids.
 */
export function buildMovementTrayParts(
  wasm: ManifoldToplevel,
  params: MovementTrayParams,
): { body: Manifold; accent: Manifold | null } {
  const full = buildMovementTray(wasm, params);
  if (params.accent === null) {
    return { body: full, accent: null };
  }
  const layer = params.accent.layerMm;
  const span = 4000;
  const accentAt = (body: Manifold, sliceZ: number, baseZ: number) => {
    const section = body.slice(sliceZ);
    const dilated = section.offset((params.accent as TrayAccent).outsetMm, 'Round', 2, 16);
    const prism = wasm.Manifold.extrude(dilated, layer);
    const accent = prism.translate(0, 0, baseZ);
    const slabProto = wasm.Manifold.cube([span, span, layer + CUT_EPSILON], false);
    const slab = slabProto.translate(
      -span / 2,
      -span / 2,
      baseZ === 0 ? -CUT_EPSILON : baseZ,
    );
    const trimmed = body.subtract(slab);
    for (const resource of [section, dilated, prism, slabProto, slab, body]) {
      resource.delete();
    }
    return { trimmed, accent };
  };
  const placement = params.accent.placement;
  let body = full;
  const accents: Manifold[] = [];
  if (placement !== 'top') {
    const bottom = accentAt(body, layer / 2, 0);
    body = bottom.trimmed;
    accents.push(bottom.accent);
  }
  if (placement !== 'bottom') {
    const box = body.boundingBox();
    const topZ = box.max[2];
    const top = accentAt(body, topZ - layer / 2, topZ - layer);
    body = top.trimmed;
    accents.push(top.accent);
  }
  let accent = accents[0];
  if (accents.length === 2) {
    accent = accents[0].add(accents[1]);
    accents[0].delete();
    accents[1].delete();
  }
  return { body, accent };
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
  if (params.style !== 'solid') {
    return buildWebTray(wasm, params, centers, pocketOutline, pitchX, pitchY, tol);
  }
  const stepped = params.formation !== 'grid';
  const pieces = stepped ? rankRects(centers, phx, phy, params.rim) : null;
  const shellOutline =
    pieces === null
      ? rectOutline(
          (params.cols * pitchX - params.gap) / 2 + params.rim,
          (params.rows * pitchY - params.gap) / 2 + params.rim,
        )
      : mergedOutline(wasm, pieces);
  return buildTray(wasm, {
    pocketOutline,
    centers,
    shellOutline,
    shellPieces: pieces,
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
    shellPieces: null,
    pocketDepth: params.pocketDepth,
    floor: params.floor,
    edgeSlope: params.edgeSlope,
    markers: params.cellMarkers
      ? { rows: params.rows, cols: params.cols, pitchX, pitchY, spanX, spanY }
      : null,
    sheetInlay: params.sheetInlay,
  });
}

/** Bases rest on this ledge inside each skeleton ring socket. */
const RING_LEDGE = 1.4;

/**
 * Skeleton and honeycomb trays modeled on the real products. Skeleton
 * trays are stepped ring sockets - a counterbore holds the base on an
 * inner ledge over a narrower through-opening - joined by a flat web
 * plate whose bridges run along the tangent hulls between neighboring
 * rings. Honeycomb trays are one shared basin: a perimeter lip follows
 * the merged silhouette while the floor inside is a regular hex mesh.
 */
function buildWebTray(
  wasm: ManifoldToplevel,
  params: MovementTrayParams,
  centers: Point2[],
  pocketOutline: Point2[],
  pitchX: number,
  pitchY: number,
  tol: number,
): Manifold {
  return withGeometryScope((track) => {
    const height = params.floor + params.pocketDepth;
    const ringOutline = outsetOutline(wasm, pocketOutline, params.rim, tol);
    const ringSections = centers.map(([x, y]) => {
      const section = track(wasm.CrossSection.ofPolygons([ringOutline]));
      return track(section.translate(x, y));
    });
    const silhouette = track(wasm.CrossSection.union(ringSections));

    let tray: Manifold;
    if (params.style === 'skeleton') {
      const reach = 1.05 * Math.max(pitchX, Math.hypot(pitchX / 2, pitchY));
      const bridges: Manifold[] = [];
      for (let a = 0; a < centers.length; a++) {
        for (let b = a + 1; b < centers.length; b++) {
          const [ax, ay] = centers[a];
          const [bx, by] = centers[b];
          if (Math.hypot(bx - ax, by - ay) > reach) {
            continue;
          }
          const points: Point2[] = [
            ...ringOutline.map(([x, y]): Point2 => [x + ax, y + ay]),
            ...ringOutline.map(([x, y]): Point2 => [x + bx, y + by]),
          ];
          const hull = convexHull(points) as Point2[];
          bridges.push(track(wasm.Manifold.extrude([hull], params.floor)));
        }
      }
      const collars = centers.map(([x, y]) => {
        const collar = track(wasm.Manifold.extrude([ringOutline], height));
        return track(collar.translate(x, y, 0));
      });
      const body = track(wasm.Manifold.union([...collars, ...bridges]));
      const throughOutline = insetOutline(wasm, pocketOutline, RING_LEDGE) as Point2[];
      const cutters: Manifold[] = [];
      for (const [x, y] of centers) {
        const bore = track(
          wasm.Manifold.extrude([pocketOutline], params.pocketDepth + CUT_EPSILON),
        );
        cutters.push(track(bore.translate(x, y, height - params.pocketDepth)));
        const through = track(
          wasm.Manifold.extrude([throughOutline], height + 2 * CUT_EPSILON),
        );
        cutters.push(track(through.translate(x, y, -CUT_EPSILON)));
      }
      tray = track(wasm.Manifold.difference([body, ...cutters]));
    } else {
      const basin = track(silhouette.offset(-params.rim, 'Round', 2, 16));
      const plate = track(wasm.Manifold.extrude(silhouette, params.floor));
      const lipRegion = track(silhouette.subtract(basin));
      const lip = track(wasm.Manifold.extrude(lipRegion, height));
      const bounds = basin.bounds();
      const acrossFlats = params.webCellMm;
      const circumradius = acrossFlats / Math.sqrt(3);
      const spacingScale = (acrossFlats + params.webStrutMm) / acrossFlats;
      const columnPitch = 1.5 * circumradius * spacingScale;
      const rowPitch = acrossFlats * spacingScale;
      const hexes: CrossSection[] = [];
      let column = 0;
      for (let x = bounds.min[0] - rowPitch; x <= bounds.max[0] + rowPitch; x += columnPitch) {
        const shift = column % 2 === 1 ? rowPitch / 2 : 0;
        for (let y = bounds.min[1] - rowPitch + shift; y <= bounds.max[1] + rowPitch; y += rowPitch) {
          const hex = track(wasm.CrossSection.ofPolygons([hexOutline(acrossFlats)]));
          hexes.push(track(hex.translate(x, y)));
        }
        column++;
      }
      const lattice = track(wasm.CrossSection.union(hexes));
      const clipped = track(lattice.intersect(basin));
      let holes: Manifold | null = null;
      if (clipped.toPolygons().length > 0) {
        const prism = track(wasm.Manifold.extrude(clipped, params.floor + 2 * CUT_EPSILON));
        holes = track(prism.translate(0, 0, -CUT_EPSILON));
      }
      const body = track(wasm.Manifold.union([plate, lip]));
      tray = holes !== null ? track(body.subtract(holes)) : body;
    }
    const status = tray.status();
    if (status !== 'NoError') {
      throw new Error(`${ERROR_INVALID_TRAY}${status}.`);
    }
    return tray;
  });
}

/** Single outer contour of the union of the rank rectangles. */
function mergedOutline(wasm: ManifoldToplevel, pieces: Point2[][]): Point2[] {
  const section = wasm.CrossSection.ofPolygons(pieces, 'Positive');
  const contours = section.toPolygons() as Point2[][];
  section.delete();
  let best = contours[0];
  let bestArea = 0;
  for (const contour of contours) {
    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const [x1, y1] = contour[i];
      const [x2, y2] = contour[(i + 1) % contour.length];
      area += x1 * y2 - x2 * y1;
    }
    if (Math.abs(area) > bestArea) {
      bestArea = Math.abs(area);
      best = contour;
    }
  }
  return best;
}

function buildTray(wasm: ManifoldToplevel, layout: TrayLayout): Manifold {
  return withGeometryScope((track) => {
    const height = layout.floor + layout.pocketDepth;
    const profile = computeEdgeProfile(height, layout.edgeSlope, 0, 0.02);
    const shell =
      layout.shellPieces === null
        ? buildShellSolid(wasm, track, shellOutlines(wasm, layout.shellOutline, profile), profile)
        : track(
            wasm.Manifold.union(
              layout.shellPieces.map((piece) =>
                buildShellSolid(wasm, track, shellOutlines(wasm, piece, profile), profile),
              ),
            ),
          );
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
