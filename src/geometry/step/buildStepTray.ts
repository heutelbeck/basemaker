import type { Drawing, Shape3D, Sketch } from 'replicad';
import { drawRectangle } from 'replicad';
import { halfExtents, resolveShape } from '../../params/shapeMetrics.ts';
import type {
  AdapterTrayParams,
  MovementTrayParams,
  SheetInlayParams,
} from '../../params/trays.ts';
import { cellCenters, formationCenters, formationHull } from '../buildTray.ts';
import { CUT_EPSILON } from '../features/shell.ts';
import type { Point2 } from '../tessellation.ts';
import { asShape3D, footprintDrawing, polylineDrawing } from './buildStepShape.ts';

interface StepTrayLayout {
  pocketDrawing: Drawing;
  centers: Point2[];
  trayDrawing: Drawing;
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
  const trayDrawing =
    params.formation === 'grid'
      ? drawRectangle(
          params.cols * pitchX - params.gap + 2 * params.rim,
          params.rows * pitchY - params.gap + 2 * params.rim,
        )
      : (() => {
          const hull = polylineDrawing(
            formationHull(centers, phx + params.gap / 2, phy + params.gap / 2),
          );
          return params.rim > 0 ? hull.offset(params.rim) : hull;
        })();
  return buildStepTray({
    pocketDrawing: grownPocketDrawing(pocket, params.clearance, params.pocketRotated),
    centers,
    trayDrawing,
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
    pocketDepth: params.pocketDepth,
    floor: params.floor,
    edgeSlope: params.edgeSlope,
    sheetInlay: params.sheetInlay,
  });
}

function buildStepTray(layout: StepTrayLayout): Shape3D {
  const height = layout.floor + layout.pocketDepth;
  const bottomSketch = layout.trayDrawing.sketchOnPlane('XY') as Sketch;
  let tray = asShape3D(
    layout.edgeSlope > 0
      ? bottomSketch.loftWith(
          layout.trayDrawing.offset(-layout.edgeSlope).sketchOnPlane('XY', height) as Sketch,
          { ruled: true },
        )
      : bottomSketch.extrude(height),
  );

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
