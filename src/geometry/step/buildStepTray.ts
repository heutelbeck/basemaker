import type { Drawing, Shape3D, Sketch } from 'replicad';
import { drawRectangle } from 'replicad';
import { halfExtents, resolveShape } from '../../params/shapeMetrics.ts';
import type {
  AdapterTrayParams,
  MovementTrayParams,
  SheetInlayParams,
} from '../../params/trays.ts';
import { cellCenters, formationCenters, rankRects } from '../buildTray.ts';
import { CUT_EPSILON } from '../features/shell.ts';
import type { Point2 } from '../../params/tessellation.ts';
import { asShape3D, footprintDrawing } from './buildStepShape.ts';

interface StepTrayLayout {
  pocketDrawing: Drawing;
  centers: Point2[];
  trayDrawing: Drawing;
  bodyPieces: Drawing[] | null;
  pocketDepth: number;
  floor: number;
  edgeSlope: number;
  sheetInlay: SheetInlayParams | null;
}

function grownPocketDrawing(
  pocket: ReturnType<typeof resolveShape>,
  clearance: number,
  rotated: boolean,
): Drawing {
  let drawing: Drawing;
  if (pocket.type === 'rect') {
    drawing = drawRectangle(2 * (pocket.hx + clearance), 2 * (pocket.hy + clearance));
  } else {
    const bare = footprintDrawing(pocket);
    drawing = clearance > 0 ? bare.offset(clearance) : bare;
  }
  return rotated ? drawing.rotate(90) : drawing;
}

export function buildStepMovementTray(params: MovementTrayParams): Shape3D {
  const pocket = resolveShape(params.pocketShape);
  const extents = halfExtents(pocket);
  const phx = (params.pocketRotated ? extents.hy : extents.hx) + params.clearance;
  const phy = (params.pocketRotated ? extents.hx : extents.hy) + params.clearance;
  const pitchX = 2 * phx + params.gap;
  const pitchY = 2 * phy + params.gap;
  const centers = formationCenters(params.formation, params.rows, params.cols, pitchX, pitchY);
  let trayDrawing: Drawing;
  let bodyPieces: Drawing[] | null = null;
  if (params.formation === 'grid') {
    trayDrawing = drawRectangle(
      params.cols * pitchX - params.gap + 2 * params.rim,
      params.rows * pitchY - params.gap + 2 * params.rim,
    );
  } else {
    const rects = rankRects(centers, phx, phy, params.rim);
    bodyPieces = rects.map((rect) => {
      const [minX, minY] = rect[0];
      const [maxX, maxY] = rect[2];
      return drawRectangle(maxX - minX, maxY - minY).translate(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
      );
    });
    trayDrawing = bodyPieces.reduce((merged, piece) => merged.fuse(piece));
  }
  return buildStepTray({
    pocketDrawing: grownPocketDrawing(pocket, params.clearance, params.pocketRotated),
    centers,
    trayDrawing,
    bodyPieces,
    pocketDepth: params.pocketDepth,
    floor: params.floor,
    edgeSlope: params.edgeSlope,
    sheetInlay: params.sheetInlay,
  });
}

export function buildStepAdapterTray(params: AdapterTrayParams): Shape3D {
  const donor = resolveShape(params.donor);
  const target = halfExtents(resolveShape(params.target));
  const pitchX = 2 * target.hx;
  const pitchY = 2 * target.hy;
  return buildStepTray({
    pocketDrawing: grownPocketDrawing(donor, params.clearance, false),
    centers: cellCenters({ rows: params.rows, cols: params.cols, pitchX, pitchY }),
    trayDrawing: drawRectangle(
      params.cols * pitchX + 2 * params.rim,
      params.rows * pitchY + 2 * params.rim,
    ),
    bodyPieces: null,
    pocketDepth: params.pocketDepth,
    floor: params.floor,
    edgeSlope: params.edgeSlope,
    sheetInlay: params.sheetInlay,
  });
}

function trayBlock(drawing: Drawing, height: number, edgeSlope: number): Shape3D {
  const bottomSketch = drawing.sketchOnPlane('XY') as Sketch;
  return asShape3D(
    edgeSlope > 0
      ? bottomSketch.loftWith(
          drawing.offset(-edgeSlope).sketchOnPlane('XY', height) as Sketch,
          { ruled: true },
        )
      : bottomSketch.extrude(height),
  );
}

function buildStepTray(layout: StepTrayLayout): Shape3D {
  const height = layout.floor + layout.pocketDepth;
  let tray =
    layout.bodyPieces === null
      ? trayBlock(layout.trayDrawing, height, layout.edgeSlope)
      : layout.bodyPieces
          .map((piece) => trayBlock(piece, height, layout.edgeSlope))
          .reduce((merged, block) => asShape3D(merged.fuse(block)));

  for (const [x, y] of layout.centers) {
    const cutter = asShape3D(
      layout.pocketDrawing
        .translate(x, y)
        .sketchOnPlane('XY', height - layout.pocketDepth)
        .extrude(layout.pocketDepth + CUT_EPSILON),
    );
    tray = asShape3D(tray.cut(cutter));
    if (layout.sheetInlay !== null && layout.sheetInlay.placement === 'pockets') {
      const inlay = asShape3D(
        layout.pocketDrawing
          .translate(x, y)
          .sketchOnPlane('XY', layout.floor - layout.sheetInlay.depth)
          .extrude(layout.sheetInlay.depth + CUT_EPSILON),
      );
      tray = asShape3D(tray.cut(inlay));
    }
  }

  if (layout.sheetInlay !== null && layout.sheetInlay.placement === 'underside') {
    const inlay = layout.sheetInlay;
    const cutter = asShape3D(
      layout.trayDrawing
        .offset(-inlay.inset)
        .sketchOnPlane('XY', -CUT_EPSILON)
        .extrude(inlay.depth + CUT_EPSILON),
    );
    tray = asShape3D(tray.cut(cutter));
  }

  return tray;
}
