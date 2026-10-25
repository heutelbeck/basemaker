import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  BaseplateConnectorHole,
  BaseplateLayout,
  BaseplateParams,
  BaseplatePiece,
} from '../params/baseplate.ts';
import {
  BASEPLATE_CELL_RADIUS_MM,
  BASEPLATE_CUT_MM,
  BASEPLATE_PROFILE,
  BASEPLATE_PROFILE_HEIGHT_MM,
  BASEPLATE_STAR_MM,
  baseplateLayout,
  connectorHoleZ,
  planBaseplate,
} from '../params/baseplate.ts';
import { GRID_PITCH_MM } from '../params/paintRack.ts';
import { segmentsFor } from '../params/tessellation.ts';
import { withGeometryScope } from './dispose.ts';
import type { Track } from './dispose.ts';
import { roundedRectPoints } from './roundedRect.ts';

const ERROR_BASEPLATE_NO_FIT = 'No baseplate split fits these drawer and build plate sizes.';
const ERROR_INVALID_BASEPLATE = 'The generated baseplate part is not a valid manifold: ';

interface Context {
  wasm: ManifoldToplevel;
  track: Track;
  params: BaseplateParams;
  tol: number;
}

function prism(
  ctx: Context,
  rect: { x0: number; x1: number; y0: number; y1: number },
  z0: number,
  z1: number,
): Manifold {
  return ctx.track(
    ctx.wasm.Manifold.cube([rect.x1 - rect.x0, rect.y1 - rect.y0, z1 - z0], false).translate(
      rect.x0,
      rect.y0,
      z0,
    ),
  );
}

/**
 * The opening of one grid cell through the receiving profile, with its
 * lower left corner on the origin: a frustum per profile segment, carried
 * on straight below the bottom and above the top so it cuts cleanly.
 */
function cellOpening(ctx: Context): Manifold {
  const half = GRID_PITCH_MM / 2;
  const levels: [number, number][] = [
    [-BASEPLATE_CUT_MM, BASEPLATE_PROFILE[0][1]],
    ...BASEPLATE_PROFILE,
    [BASEPLATE_PROFILE_HEIGHT_MM + BASEPLATE_CUT_MM, 0],
  ];
  const slice = ([z, inset]: [number, number]) =>
    roundedRectPoints(half - inset, BASEPLATE_CELL_RADIUS_MM - inset, z, ctx.tol);
  const frustums = levels
    .slice(1)
    .map((level, i) => ctx.track(ctx.wasm.Manifold.hull([...slice(levels[i]), ...slice(level)])));
  return ctx.track(ctx.track(ctx.wasm.Manifold.union(frustums)).translate(half, half, 0));
}

/** The receiving profile, kept only within the node arms around every crossing. */
function nodes(ctx: Context, layout: BaseplateLayout): Manifold {
  const { wasm, track } = ctx;
  const arm = ctx.params.nodeArmMm;
  const plate = prism(ctx, layout.grid, 0, BASEPLATE_PROFILE_HEIGHT_MM);
  const opening = cellOpening(ctx);
  const openings = layout.cells.map(([x, y]) => track(opening.translate(x, y, 0)));
  // Each node a square frustum: the arm length at the top, its ends sloping
  // down outwards at 45 degrees so they print without a hard step.
  const bottom = -BASEPLATE_CUT_MM;
  const top = BASEPLATE_PROFILE_HEIGHT_MM + BASEPLATE_CUT_MM;
  const square = (half: number, z: number): [number, number, number][] => [
    [-half, -half, z],
    [half, -half, z],
    [half, half, z],
    [-half, half, z],
  ];
  const frustum = track(
    wasm.Manifold.hull([
      ...square(arm + BASEPLATE_PROFILE_HEIGHT_MM - bottom, bottom),
      ...square(arm + BASEPLATE_PROFILE_HEIGHT_MM - top, top),
    ]),
  );
  const reach = track(
    wasm.Manifold.union(layout.crossings.map(([x, y]) => track(frustum.translate(x, y, 0)))),
  );
  const profile = track(plate.subtract(track(wasm.Manifold.union(openings))));
  return track(profile.intersect(reach));
}

/** A connector hole with a pointed top so it prints without overhang. */
function connectorHole(ctx: Context, hole: BaseplateConnectorHole): Manifold {
  const { wasm, track, params } = ctx;
  const radius = params.connectorHoleMm / 2;
  const segments = Math.max(16, segmentsFor(radius, ctx.tol));
  const outline: [number, number][] = [];
  // The arc from 135 degrees round the bottom to 45 degrees, closed by the tip.
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI * 0.75 + (Math.PI * 1.5 * i) / segments;
    outline.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  outline.push([0, radius * Math.SQRT2]);
  const section = track(wasm.CrossSection.ofPolygons([outline]));
  const rod = track(
    track(wasm.Manifold.extrude(section, hole.length)).translate(0, 0, -hole.length / 2),
  );
  // Stood upright across the Y axis, then turned onto the X axis if needed.
  const upright = track(rod.rotate([90, 0, 0]));
  const turned = hole.alongY ? upright : track(upright.rotate([0, 0, 90]));
  return track(turned.translate(hole.x, hole.y, connectorHoleZ(params)));
}

function circle(ctx: Context, radius: number, x: number, y: number) {
  const segments = Math.max(16, segmentsFor(radius, ctx.tol));
  return ctx.track(ctx.wasm.CrossSection.circle(radius, segments).translate([x, y]));
}

/**
 * Star holes through the crossings, kept within the grid: the square
 * between the four cell corners less the corner arcs.
 */
function starHoles(ctx: Context, layout: BaseplateLayout): Manifold {
  const { wasm, track } = ctx;
  const size = BASEPLATE_STAR_MM;
  const arcs = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => circle(ctx, size, sx * size, sy * size)),
  );
  const square = track(wasm.CrossSection.square([2 * size, 2 * size], true));
  const star = track(square.subtract(track(wasm.CrossSection.union(arcs))));
  const stars = track(
    wasm.CrossSection.union(layout.starCrossings.map(([x, y]) => track(star.translate([x, y])))),
  );
  const height = BASEPLATE_PROFILE_HEIGHT_MM + 2 * BASEPLATE_CUT_MM;
  const prisms = track(
    track(wasm.Manifold.extrude(stars, height)).translate(0, 0, -BASEPLATE_CUT_MM),
  );
  return track(prisms.intersect(prism(ctx, layout.grid, -BASEPLATE_CUT_MM, height)));
}

/**
 * Rounded drawer corners: what lies outside the corner arc is cut away,
 * and the corner inside the arc is filled at bar height up to the opening
 * of the nearest cell, so the wall bars stay joined with no gap.
 */
function roundCorners(ctx: Context, layout: BaseplateLayout, material: Manifold): Manifold {
  const { wasm, track, params } = ctx;
  const radius = params.cornerRadiusMm;
  if (radius <= 0 || layout.corners.length === 0) {
    return material;
  }
  const opening = cellOpening(ctx);
  let result = material;
  for (const { x, y, dx, dy, cell } of layout.corners) {
    const cx = x + dx * radius;
    const cy = y + dy * radius;
    const box = track(
      wasm.CrossSection.square([radius, radius], false).translate([
        Math.min(x, cx),
        Math.min(y, cy),
      ]),
    );
    const disk = circle(ctx, radius, cx, cy);
    const outside = track(box.subtract(disk));
    const cutter = track(
      track(
        wasm.Manifold.extrude(outside, BASEPLATE_PROFILE_HEIGHT_MM + 2 * BASEPLATE_CUT_MM),
      ).translate(0, 0, -BASEPLATE_CUT_MM),
    );
    const inside = track(wasm.Manifold.extrude(track(disk.intersect(box)), params.barHeightMm));
    const fill = track(inside.subtract(track(opening.translate(cell[0], cell[1], 0))));
    result = track(track(result.subtract(cutter)).add(fill));
  }
  return result;
}

/**
 * One part of the baseplate, centered on its outline. Alike parts come out
 * as identical meshes wherever they sit in the drawer. The caller owns the
 * result.
 */
export function buildBaseplatePiece(
  wasm: ManifoldToplevel,
  params: BaseplateParams,
  piece: BaseplatePiece,
): Manifold {
  return withGeometryScope((track) => {
    const ctx: Context = { wasm, track, params, tol: params.quality.chordTolMm };
    const layout = baseplateLayout(params, piece);
    const bars = layout.bars.map((rect) => prism(ctx, rect, 0, params.barHeightMm));
    const material = track(wasm.Manifold.union([...bars, nodes(ctx, layout)]));
    const holes = [
      ...(params.connectorHoles
        ? layout.connectorHoles.map((hole) => connectorHole(ctx, hole))
        : []),
      ...(params.starHoles && layout.starCrossings.length > 0 ? [starHoles(ctx, layout)] : []),
    ];
    const drilled =
      holes.length === 0 ? material : track(material.subtract(track(wasm.Manifold.union(holes))));
    const result = roundCorners(ctx, layout, drilled);
    // A tracked result is released by the geometry scope when this throws.
    const status = result.status();
    if (status !== 'NoError') {
      throw new Error(`${ERROR_INVALID_BASEPLATE}${status}.`);
    }
    return result;
  });
}

/** The parts of the drawer, or an error when no split fits the build plate. */
export function baseplatePieces(params: BaseplateParams): BaseplatePiece[] {
  const pieces = planBaseplate(params);
  if (pieces === null) {
    throw new Error(ERROR_BASEPLATE_NO_FIT);
  }
  return pieces;
}

/** Every part of the drawer with its solid in place; the caller owns the solids. */
export function buildBaseplatePieces(
  wasm: ManifoldToplevel,
  params: BaseplateParams,
): { piece: BaseplatePiece; solid: Manifold }[] {
  return baseplatePieces(params).map((piece) => {
    const centered = buildBaseplatePiece(wasm, params, piece);
    try {
      return { piece, solid: centered.translate(piece.centerX, piece.centerY, 0) };
    } finally {
      centered.delete();
    }
  });
}

/** All parts of the drawer, in place, as one solid. The caller owns the result. */
export function buildBaseplate(wasm: ManifoldToplevel, params: BaseplateParams): Manifold {
  const pieces = buildBaseplatePieces(wasm, params);
  const merged = wasm.Manifold.union(pieces.map(({ solid }) => solid));
  for (const { solid } of pieces) {
    solid.delete();
  }
  return merged;
}
