import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  PaintRackLayout,
  PaintRackModule,
  PaintRackParams,
  Vec3,
} from '../params/paintRack.ts';
import {
  BIN_CORNER_RADIUS_MM,
  BOTTOM_CUP_MM,
  END_STOP_MM,
  FOOT_CORE_HALF_MM,
  FOOT_HEIGHT_MM,
  GRID_PITCH_MM,
  BIN_GAP_MM,
  planRacks,
  footRadiusAt,
  pocketPlanExtent,
  pocketRadiusAt,
  solvePaintRack,
} from '../params/paintRack.ts';
import { segmentsFor } from '../params/tessellation.ts';
import { roundedRectPoints } from './roundedRect.ts';
import { withGeometryScope } from './dispose.ts';
import type { Track } from './dispose.ts';

const ERROR_INVALID_PAINT_RACK = 'The generated paint rack is not a valid manifold: ';
const ERROR_PAINT_RACK_UNSOLVED = 'No bottle layout fits these paint rack parameters.';

/** Lateral offset of the two support ribs under a bottle, as a share of its radius. */
const RIB_OFFSET_SHARE = 0.6;
/** Extra rib offsets below the bottle bottom, as shares of its radius. */
const BOTTOM_RIB_SHARES = [-0.3, 0, 0.3];
/** Radius that rounds the knife edges where neighboring block bores overlap. */
const BORE_EDGE_ROUND_MM = 2;
/** Heights at which the foot profile changes slope, bottom to top. */
const FOOT_PROFILE_LEVELS = [0, 0.8, 2.6, FOOT_HEIGHT_MM];

interface Context {
  wasm: ManifoldToplevel;
  track: Track;
  params: PaintRackParams;
  layout: PaintRackLayout;
  /** The rack being built; geometry stays in drawer coordinates. */
  rack: PaintRackModule;
  big: number;
}

function hullOfLevels(ctx: Context, levels: [number, number][]): Manifold {
  const tol = ctx.params.quality.chordTolMm;
  const points = levels.flatMap(([z, radius]) =>
    roundedRectPoints(FOOT_CORE_HALF_MM + radius, radius, z, tol),
  );
  return ctx.track(ctx.wasm.Manifold.hull(points));
}

/** One solid Gridfinity bin foot, the convex hull of its profile levels. */
function footCell(ctx: Context): Manifold {
  return hullOfLevels(
    ctx,
    FOOT_PROFILE_LEVELS.map((z) => [z, footRadiusAt(z)]),
  );
}

/**
 * Inside of a hollow foot: the foot shrunk by one wall (the chamfer by a
 * horizontal wall times sqrt 2 so its normal thickness stays one wall),
 * from the floor up through the open top.
 */
function footCavity(ctx: Context): Manifold {
  const { wallMm, floorMm } = ctx.params;
  const top = FOOT_HEIGHT_MM + 0.01;
  return hullOfLevels(ctx, [
    [floorMm, footRadiusAt(floorMm) - wallMm],
    [2.6, footRadiusAt(2.6) - wallMm],
    [top, footRadiusAt(FOOT_HEIGHT_MM) - wallMm * Math.SQRT2],
  ]);
}

/** Centers of the rack's grid cells in drawer coordinates. */
function cellCenters(ctx: Context): [number, number][] {
  const { rack } = ctx;
  const centers: [number, number][] = [];
  for (let i = rack.startX; i < rack.startX + rack.unitsX; i++) {
    for (let j = rack.startY; j < rack.startY + rack.unitsY; j++) {
      centers.push([
        rack.centerX + (i - rack.startX - (rack.unitsX - 1) / 2) * GRID_PITCH_MM,
        rack.centerY + (j - rack.startY - (rack.unitsY - 1) / 2) * GRID_PITCH_MM,
      ]);
    }
  }
  return centers;
}

function binOutlinePrism(ctx: Context, bottom: number, top: number): Manifold {
  const { rack } = ctx;
  const width = rack.unitsX * GRID_PITCH_MM - BIN_GAP_MM;
  const depth = rack.unitsY * GRID_PITCH_MM - BIN_GAP_MM;
  const radius = BIN_CORNER_RADIUS_MM;
  const core = ctx.track(
    ctx.wasm.CrossSection.square([width - 2 * radius, depth - 2 * radius], true),
  );
  const outline = ctx.track(
    core.offset(radius, 'Round', 2, segmentsFor(radius, ctx.params.quality.chordTolMm)),
  );
  return ctx.track(
    ctx.wasm.Manifold.extrude(outline, top - bottom).translate(rack.centerX, rack.centerY, bottom),
  );
}

/**
 * The base the bottle supports stand on: a flat floor, or Gridfinity feet
 * tied together above the foot profile. Cradle and filled racks get solid
 * feet and a full tie plate; rib racks get hollow feet and a tie lattice along
 * the cell borders, leaving the cell centers open for the supports.
 */
function basePlate(ctx: Context): Manifold {
  const { params, track, wasm } = ctx;
  if (!params.gridfinity) {
    return binOutlinePrism(ctx, 0, params.floorMm);
  }
  const ribs = params.fill === 'ribs';
  const foot = footCell(ctx);
  const cell = ribs ? track(foot.subtract(footCavity(ctx))) : foot;
  const centers = cellCenters(ctx);
  const pieces = centers.map(([cx, cy]) => track(cell.translate(cx, cy, 0)));
  let tie = binOutlinePrism(ctx, FOOT_HEIGHT_MM, FOOT_HEIGHT_MM + params.floorMm);
  if (ribs) {
    // The openings match the cavity tops, so the lattice rests on the foot walls.
    const radius = footRadiusAt(FOOT_HEIGHT_MM) - params.wallMm * Math.SQRT2;
    const opening = hullOfLevels(ctx, [
      [FOOT_HEIGHT_MM - 1, radius],
      [FOOT_HEIGHT_MM + params.floorMm + 1, radius],
    ]);
    const openings = centers.map(([cx, cy]) => track(opening.translate(cx, cy, 0)));
    tie = track(tie.subtract(track(wasm.Manifold.union(openings))));
  }
  pieces.push(tie);
  return track(wasm.Manifold.union(pieces));
}

/**
 * Space the bottle supports may fill: above the foot profile everywhere
 * inside the outline, plus the foot cells themselves so supports reach
 * down to the floor of sunken bottles.
 */
function supportRegion(ctx: Context): Manifold {
  const { params, track, wasm } = ctx;
  if (!params.gridfinity) {
    return binOutlinePrism(ctx, 0, ctx.big);
  }
  const foot = footCell(ctx);
  const pieces = cellCenters(ctx).map(([cx, cy]) => track(foot.translate(cx, cy, 0)));
  pieces.push(binOutlinePrism(ctx, FOOT_HEIGHT_MM, ctx.big));
  return track(wasm.Manifold.union(pieces));
}

/**
 * A truncated cone along the bottle axis from axial position s0 to s1,
 * placed at the bottle's axis start.
 */
function axialSegment(
  ctx: Context,
  anchor: Vec3,
  s0: number,
  s1: number,
  r0: number,
  r1: number,
): Manifold {
  const segments = segmentsFor(Math.max(r0, r1), ctx.params.quality.chordTolMm);
  const cone = ctx.track(ctx.wasm.Manifold.cylinder(s1 - s0, r0, r1, segments, false));
  return ctx.track(
    cone
      .translate(0, 0, s0)
      .rotate([ctx.layout.tiltDeg - 90, 0, 0])
      .translate(anchor[0], anchor[1], anchor[2]),
  );
}

/** Body and neck of one pocket, each as its own convex piece. */
function pocketPieces(ctx: Context, anchor: Vec3, grow: number, rearGrow: number): Manifold[] {
  const { bottle } = ctx.params;
  const body = bottle.bodyLengthMm;
  return [
    axialSegment(
      ctx,
      anchor,
      -rearGrow,
      body,
      pocketRadiusAt(ctx.params, 0) + grow,
      pocketRadiusAt(ctx.params, 0) + grow,
    ),
    axialSegment(
      ctx,
      anchor,
      body,
      bottle.lengthMm,
      pocketRadiusAt(ctx.params, body + 1e-6) + grow,
      pocketRadiusAt(ctx.params, bottle.lengthMm) + grow,
    ),
  ];
}

/** Sweeps convex pieces vertically by `rise` (positive up, negative down). */
function verticalSweep(ctx: Context, pieces: Manifold[], rise: number): Manifold {
  const swept = pieces.map((piece) =>
    ctx.track(ctx.wasm.Manifold.hull([piece, ctx.track(piece.translate(0, 0, rise))])),
  );
  return ctx.track(ctx.wasm.Manifold.union(swept));
}

/**
 * Half-space below the plane through a tilted bottle's axis that holds
 * its lateral direction, so cradle walls end at the bottle's equator.
 */
function belowAxisPlane(ctx: Context, anchor: Vec3): Manifold {
  const size = 4 * ctx.big;
  const box = ctx.track(ctx.wasm.Manifold.cube([size, size, size], true));
  return ctx.track(
    box
      .translate(0, 0, -size / 2)
      .rotate([ctx.layout.tiltDeg, 0, 0])
      .translate(anchor[0], anchor[1], anchor[2]),
  );
}

/**
 * The supported part of a pocket grown by one wall: from the end stop
 * behind the bottle bottom up to `length` along the bottle.
 */
function supportedPieces(ctx: Context, anchor: Vec3, length: number): Manifold[] {
  const { params } = ctx;
  const wall = params.wallMm;
  const body = params.bottle.bodyLengthMm;
  const bodyRadius = pocketRadiusAt(params, 0) + wall;
  const pieces = [
    axialSegment(ctx, anchor, -END_STOP_MM, Math.min(length, body), bodyRadius, bodyRadius),
  ];
  if (length > body) {
    pieces.push(
      axialSegment(
        ctx,
        anchor,
        body,
        length,
        pocketRadiusAt(params, body + 1e-6) + wall,
        pocketRadiusAt(params, length) + wall,
      ),
    );
  }
  return pieces;
}

/** A vertical wall of one wall thickness through the given plan box. */
function verticalWall(ctx: Context, x0: number, x1: number, y0: number, y1: number): Manifold {
  return ctx.track(
    ctx.wasm.Manifold.cube([x1 - x0, y1 - y0, 2 * ctx.big], false).translate(x0, y0, -ctx.big),
  );
}

/** Half-space below a horizontal plane at height `z`. */
function belowHeight(ctx: Context, z: number): Manifold {
  const { rack } = ctx;
  // Centered on the rack and wider than it, so no rack of a wide drawer is cut.
  const size = 4 * ctx.big + 2 * Math.max(rack.unitsX, rack.unitsY) * GRID_PITCH_MM;
  return ctx.track(
    ctx.wasm.Manifold.cube([size, size, size], true).translate(
      rack.centerX,
      rack.centerY,
      z - size / 2,
    ),
  );
}

/**
 * End stop plate behind a tilted bottle: perpendicular to the bottle axis,
 * one end stop thick, across the lateral pitch, reaching from the floor
 * up to the axis. It leans back by the tilt angle, which prints without
 * supports at the tilts a low drawer allows.
 */
function endStopPlate(ctx: Context, anchor: Vec3, halfSpan: number): Manifold {
  const plate = ctx.wasm.Manifold.cube([2 * halfSpan, 4 * ctx.big, END_STOP_MM], false);
  return ctx.track(
    ctx
      .track(plate)
      .translate(-halfSpan, -2 * ctx.big, -END_STOP_MM)
      .rotate([ctx.layout.tiltDeg - 90, 0, 0])
      .translate(anchor[0], anchor[1], anchor[2]),
  );
}

/**
 * Support of one tilted bottle. Cradle racks fill below the bottle up to
 * the support length, including a thick end stop behind its bottom.
 * Filled racks fill below the whole bottle, but only up to the height the
 * supports reach, so all rows end level. Rib racks carry the bottle on two
 * longitudinal ribs, add three short ribs and a brace below its bottom,
 * and back it with a leaning end stop plate; transverse braces halfway
 * and at the end of the ribs span the lateral pitch, so they join their
 * neighbors into one egg-crate that keeps the thin ribs from buckling.
 */
function tiltedSupport(ctx: Context, anchor: Vec3): Manifold {
  const { params, layout } = ctx;
  const clip = belowAxisPlane(ctx, anchor);
  const tilt = (layout.tiltDeg * Math.PI) / 180;
  const length = Math.min(params.supportLengthMm, params.bottle.lengthMm);
  if (params.fill !== 'ribs') {
    const filled = params.fill === 'filled';
    const reach = filled ? params.bottle.lengthMm : length;
    const cradle = verticalSweep(ctx, supportedPieces(ctx, anchor, reach), -ctx.big);
    const clipped = ctx.track(cradle.intersect(clip));
    if (!filled) {
      return clipped;
    }
    const level = anchor[2] + length * Math.sin(tilt);
    return ctx.track(clipped.intersect(belowHeight(ctx, level)));
  }
  const wall = params.wallMm;
  const cos = Math.cos(tilt);
  const { rear } = pocketPlanExtent(params, layout.tiltDeg);
  const [cx, cy] = anchor;
  const ribEnd = cy + length * cos;
  const offset = RIB_OFFSET_SHARE * pocketRadiusAt(params, 0);
  const rib = (dx: number, end: number) =>
    verticalWall(ctx, cx + dx - wall / 2, cx + dx + wall / 2, cy + rear - END_STOP_MM, end);
  const walls = [rib(-offset, ribEnd), rib(offset, ribEnd)];
  const radius = pocketRadiusAt(params, 0);
  for (const share of BOTTOM_RIB_SHARES) {
    walls.push(rib(share * radius, cy + BOTTOM_CUP_MM * cos));
  }
  const halfSpan = layout.pitchX / 2 + wall / 2;
  for (const s of [BOTTOM_CUP_MM, length / 2, length - wall / 2]) {
    const y = cy + s * cos;
    walls.push(verticalWall(ctx, cx - halfSpan, cx + halfSpan, y - wall / 2, y + wall / 2));
  }
  walls.push(endStopPlate(ctx, anchor, halfSpan));
  return ctx.track(ctx.track(ctx.wasm.Manifold.union(walls)).intersect(clip));
}

function uprightSupport(ctx: Context, anchor: Vec3): Manifold {
  const { params } = ctx;
  const top = ctx.layout.pocketFloor + params.uprightDepthMm;
  const radius = pocketRadiusAt(params, 0) + params.wallMm;
  const tube = ctx.wasm.Manifold.cylinder(
    top + ctx.big,
    radius,
    radius,
    segmentsFor(radius, params.quality.chordTolMm),
    false,
  );
  return ctx.track(ctx.track(tube).translate(anchor[0], anchor[1], -ctx.big));
}

function uprightPocket(ctx: Context, anchor: Vec3): Manifold {
  const { params } = ctx;
  const radius = pocketRadiusAt(params, 0);
  const pocket = ctx.wasm.Manifold.cylinder(
    ctx.big,
    radius,
    radius,
    segmentsFor(radius, params.quality.chordTolMm),
    false,
  );
  return ctx.track(ctx.track(pocket).translate(anchor[0], anchor[1], ctx.layout.pocketFloor));
}

/**
 * Bore for one tilted bottle in a block rack: the round body pocket along
 * the bottle axis from its bottom, running out of the top of the block in
 * an elliptical opening, so the block holds the bottle from above too.
 * Bores of neighbors closer than the pocket diameter run into each other.
 */
function blockBore(ctx: Context, anchor: Vec3): Manifold {
  const radius = pocketRadiusAt(ctx.params, 0);
  return axialSegment(ctx, anchor, 0, ctx.params.bottle.lengthMm + ctx.big, radius, radius);
}

/**
 * Cutters that round the knife edges between overlapping block bores. Two
 * parallel bores closer than their diameter meet in two straight edges
 * along their common length; each cutter takes the tip of the wedge off
 * down to a circle of BORE_EDGE_ROUND_MM touching both bores, so the edge
 * becomes round and the star-shaped islands on top lose their points.
 */
function boreEdgeRounding(ctx: Context, anchors: Vec3[]): Manifold[] {
  const { wasm, track, params, layout } = ctx;
  const radius = pocketRadiusAt(params, 0);
  const round = BORE_EDGE_ROUND_MM;
  const length = params.bottle.lengthMm + ctx.big;
  const turn = ((layout.tiltDeg - 90) * Math.PI) / 180;
  // The bore frame of axialSegment: x across, z along the bottle axis.
  const frameY: Vec3 = [0, Math.cos(turn), Math.sin(turn)];
  const frameZ: Vec3 = [0, -Math.sin(turn), Math.cos(turn)];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const segments = segmentsFor(round, params.quality.chordTolMm);
  const cutters: Manifold[] = [];
  anchors.forEach((a, i) => {
    for (const b of anchors.slice(i + 1)) {
      const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const bx = delta[0];
      const by = dot(delta, frameY);
      const distance = Math.hypot(bx, by);
      if (distance < 1e-6 || distance >= 2 * radius - 1e-6) {
        continue;
      }
      const along = dot(delta, frameZ);
      const z0 = Math.max(0, along);
      const z1 = Math.min(length, along + length);
      if (z1 <= z0) {
        continue;
      }
      const [ux, uy] = [bx / distance, by / distance];
      const [nx, ny] = [-uy, ux];
      const [cx, cy] = [bx / 2, by / 2];
      const tip = Math.sqrt(radius ** 2 - (distance / 2) ** 2);
      const reach = Math.sqrt((radius + round) ** 2 - (distance / 2) ** 2);
      for (const side of [1, -1]) {
        const center: [number, number] = [cx + side * reach * nx, cy + side * reach * ny];
        const touchA: [number, number] = [
          (center[0] * radius) / (radius + round),
          (center[1] * radius) / (radius + round),
        ];
        const touchB: [number, number] = [
          bx + ((center[0] - bx) * radius) / (radius + round),
          by + ((center[1] - by) * radius) / (radius + round),
        ];
        // The apex sits inside both bores, past the edge it removes.
        const apex: [number, number] = [cx + side * (tip - 1) * nx, cy + side * (tip - 1) * ny];
        const area =
          (touchA[0] - apex[0]) * (touchB[1] - apex[1]) -
          (touchB[0] - apex[0]) * (touchA[1] - apex[1]);
        const triangle = track(
          wasm.CrossSection.ofPolygons([
            area > 0 ? [apex, touchA, touchB] : [apex, touchB, touchA],
          ]),
        );
        const disk = track(wasm.CrossSection.circle(round, segments).translate(center));
        const profile = track(triangle.subtract(disk));
        cutters.push(
          track(
            track(wasm.Manifold.extrude(profile, z1 - z0))
              .translate(0, 0, z0)
              .rotate([layout.tiltDeg - 90, 0, 0])
              .translate(a[0], a[1], a[2]),
          ),
        );
      }
    }
  });
  return cutters;
}

/**
 * Bottles of the drawer pattern that reach onto a rack: their supports and
 * pockets are cut from it, including bottles whose end stop sits on a
 * neighboring rack.
 */
function bottlesOnRack(ctx: Context, candidates: Vec3[]): Vec3[] {
  const { params, layout, rack } = ctx;
  const radius = pocketRadiusAt(params, 0);
  const extent =
    params.orientation === 'upright'
      ? { rear: -radius, front: radius }
      : pocketPlanExtent(params, layout.tiltDeg);
  const halfX = (rack.unitsX * GRID_PITCH_MM) / 2 + radius + 1;
  const halfY = (rack.unitsY * GRID_PITCH_MM) / 2;
  return candidates.filter(
    ([x, y]) =>
      Math.abs(x - rack.centerX) <= halfX &&
      y + extent.rear - END_STOP_MM - 1 <= rack.centerY + halfY &&
      y + extent.front + 1 >= rack.centerY - halfY,
  );
}

/**
 * Builds one rack of the drawer as one solid: the base, a support per bottle
 * (braced ribs, a cradle, or fill below the whole bottle when tilted, a
 * tube or a block when upright), and every bottle pocket swept straight up so bottles drop in
 * from above and the print needs no supports. The rack is centered on the
 * origin. The caller owns the result.
 */
export function buildPaintRackModule(
  wasm: ManifoldToplevel,
  params: PaintRackParams,
  rack: PaintRackModule,
): Manifold {
  const solved = solvePaintRack(params);
  if (solved === null) {
    throw new Error(ERROR_PAINT_RACK_UNSOLVED);
  }
  // Built around its own center, racks with the same share of the pattern
  // come out as identical meshes wherever they sit in the drawer.
  const snap = (value: number) => Math.round(value * 1e6) / 1e6;
  const shift = ([x, y, z]: Vec3): Vec3 => [snap(x - rack.centerX), snap(y - rack.centerY), z];
  const layout: PaintRackLayout = {
    ...solved,
    bottles: solved.bottles.map(shift),
    cutOnly: solved.cutOnly.map(shift),
  };
  const local: PaintRackModule = { ...rack, centerX: 0, centerY: 0 };
  return withGeometryScope((track) => {
    const ctx: Context = { wasm, track, params, layout, rack: local, big: layout.binTop + 20 };
    // Pattern positions without a bottle get the same geometry, and a fixed
    // order keeps the boolean operations alike for alike racks.
    const bottles = bottlesOnRack(ctx, [...layout.bottles, ...layout.cutOnly]).sort(
      (a, b) => a[1] - b[1] || a[0] - b[0],
    );
    const upright = params.orientation === 'upright';
    const block = !upright && params.fill === 'block';
    const region = supportRegion(ctx);
    let supports: Manifold;
    if (block) {
      // One level top for every row, at the height the supports reach.
      const length = Math.min(params.supportLengthMm, params.bottle.lengthMm);
      const level = layout.bottles[0][2] + length * Math.sin((layout.tiltDeg * Math.PI) / 180);
      supports = track(region.intersect(belowHeight(ctx, level)));
    } else if (upright && params.fill !== 'ribs') {
      const block = binOutlinePrism(ctx, 0, layout.pocketFloor + params.uprightDepthMm);
      supports = track(block.intersect(region));
    } else {
      const pieces = bottles.map((anchor) =>
        upright ? uprightSupport(ctx, anchor) : tiltedSupport(ctx, anchor),
      );
      supports = track(track(wasm.Manifold.union(pieces)).intersect(region));
    }
    const pockets = bottles.map((anchor) => {
      if (upright) {
        return uprightPocket(ctx, anchor);
      }
      return block
        ? blockBore(ctx, anchor)
        : verticalSweep(ctx, pocketPieces(ctx, anchor, 0, 0), ctx.big);
    });
    if (block) {
      pockets.push(...boreEdgeRounding(ctx, bottles));
    }
    const material = track(wasm.Manifold.union([basePlate(ctx), supports]));
    const result = track(material.subtract(track(wasm.Manifold.union(pockets))));
    // A tracked result is released by the geometry scope when this throws.
    const status = result.status();
    if (status !== 'NoError') {
      throw new Error(`${ERROR_INVALID_PAINT_RACK}${status}.`);
    }
    return result;
  });
}

/** Every rack of the drawer with its solid; the caller owns the solids. */
export function buildPaintRacks(
  wasm: ManifoldToplevel,
  params: PaintRackParams,
): { rack: PaintRackModule; solid: Manifold }[] {
  return planRacks(params).map((rack) => {
    const centered = buildPaintRackModule(wasm, params, rack);
    try {
      return { rack, solid: centered.translate(rack.centerX, rack.centerY, 0) };
    } finally {
      centered.delete();
    }
  });
}

/** All racks of the drawer, in place, as one solid. The caller owns the result. */
export function buildPaintRack(wasm: ManifoldToplevel, params: PaintRackParams): Manifold {
  const racks = buildPaintRacks(wasm, params);
  const merged = wasm.Manifold.union(racks.map(({ solid }) => solid));
  for (const { solid } of racks) {
    solid.delete();
  }
  return merged;
}

/**
 * Mock bottles for the preview: the real bottle profile without
 * clearance, resting on the bottom of its pocket. Bodies and necks come
 * back as separate solids so the preview can color the caps. The caller
 * owns both results.
 */
export function buildPaintRackBottles(
  wasm: ManifoldToplevel,
  params: PaintRackParams,
): { bodies: Manifold; necks: Manifold } | null {
  const layout = solvePaintRack(params);
  if (layout === null) {
    return null;
  }
  return withGeometryScope((track) => {
    const ctx: Context = {
      wasm,
      track,
      params,
      layout,
      rack: planRacks(params)[0],
      big: layout.binTop + 20,
    };
    const shrink = params.clearanceMm / 2;
    const tilt = (layout.tiltDeg * Math.PI) / 180;
    // A tilted bottle settles perpendicular to its axis onto the pocket bottom.
    const settle = params.orientation === 'upright' ? 0 : shrink;
    const placed = layout.bottles.map(([x, y, z]): Vec3 => [
      x,
      y + settle * Math.sin(tilt),
      z - settle * Math.cos(tilt),
    ]);
    const pieces = placed.map((anchor) => pocketPieces(ctx, anchor, -shrink, 0));
    const bodies = wasm.Manifold.union(pieces.map(([body]) => body));
    const necks = wasm.Manifold.union(pieces.map(([, neck]) => neck));
    return { bodies, necks };
  });
}
