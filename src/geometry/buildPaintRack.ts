import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  PaintRackLayout,
  PaintRackModule,
  PaintRackParams,
  Vec3,
} from '../params/paintRack.ts';
import {
  BIN_CORNER_RADIUS_MM,
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

/** Radius that rounds the knife edges where neighboring block bores overlap. */
const BORE_EDGE_ROUND_MM = 2;
/** How much steeper than the bottle an eased bore leaves the block top. */
const MOUTH_EASE_DEG = 10;
/** Depth below the block top over which an eased bore bends to its steeper exit. */
const MOUTH_EASE_DEPTH_MM = 4;
/** Radius that rounds the edges where the bores leave the block top. */
const MOUTH_ROUND_MM = 1;
/** Radius that blunts the point of the fin between two bores at the block top. */
const MOUTH_TIP_ROUND_MM = 2;
/** Radius in plan of the tongue the blunted fin ends in. */
const MOUTH_TIP_PLAN_MM = 8;
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

/**
 * Solid through the outline levels of a foot profile, one convex hull per
 * pair of neighboring levels, so the kink where the vertical section meets
 * a chamfer stays sharp instead of being bridged by one overall hull.
 */
function stackedHulls(ctx: Context, levels: [number, number][]): Manifold {
  const tol = ctx.params.quality.chordTolMm;
  const outline = ([z, radius]: [number, number]) =>
    roundedRectPoints(FOOT_CORE_HALF_MM + radius, radius, z, tol);
  const segments = levels
    .slice(1)
    .map((level, i) =>
      ctx.track(ctx.wasm.Manifold.hull([...outline(levels[i]), ...outline(level)])),
    );
  return ctx.track(ctx.wasm.Manifold.union(segments));
}

/** One solid Gridfinity bin foot following its profile levels. */
function footCell(ctx: Context): Manifold {
  return stackedHulls(
    ctx,
    FOOT_PROFILE_LEVELS.map((z) => [z, footRadiusAt(z)]),
  );
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
 * The base the block stands on: a flat floor, or solid Gridfinity feet tied
 * together by a plate above the foot profile.
 */
function basePlate(ctx: Context): Manifold {
  const { params, track, wasm } = ctx;
  if (!params.gridfinity) {
    return binOutlinePrism(ctx, 0, params.floorMm);
  }
  const foot = footCell(ctx);
  const pieces = cellCenters(ctx).map(([cx, cy]) => track(foot.translate(cx, cy, 0)));
  pieces.push(binOutlinePrism(ctx, FOOT_HEIGHT_MM, FOOT_HEIGHT_MM + params.floorMm));
  return track(wasm.Manifold.union(pieces));
}

/**
 * Space the block may fill: above the foot profile everywhere inside the
 * outline, plus the foot cells themselves so the block reaches down to the
 * floor of sunken bottles.
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

/** Two block bores closer than their diameter, in the bore frame of the first. */
interface BorePair {
  anchor: Vec3;
  /** Across (unit) and normal directions in the frame's x-y plane. */
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  /** Midpoint between the two axes. */
  cx: number;
  cy: number;
  /** Axial range the bores share. */
  z0: number;
  z1: number;
  /** Distance from the midpoint to the knife edges. */
  tip: number;
  /** Distance from the midpoint to the centers of the rounding circles. */
  reach: number;
}

/** Vectors of the bore frame of axialSegment: x across, z along the bottle axis. */
function boreFrame(ctx: Context): { frameY: Vec3; frameZ: Vec3 } {
  const turn = ((ctx.layout.tiltDeg - 90) * Math.PI) / 180;
  return {
    frameY: [0, Math.cos(turn), Math.sin(turn)],
    frameZ: [0, -Math.sin(turn), Math.cos(turn)],
  };
}

/**
 * Pairs of parallel bores closer than their diameter: they meet in two
 * straight edges along their common length, one on the floor side and one
 * on the roof side of the bottles.
 */
function borePairs(ctx: Context, anchors: Vec3[]): BorePair[] {
  const { params } = ctx;
  const radius = pocketRadiusAt(params, 0);
  const length = params.bottle.lengthMm + ctx.big;
  const { frameY, frameZ } = boreFrame(ctx);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const pairs: BorePair[] = [];
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
      pairs.push({
        anchor: a,
        ux,
        uy,
        nx: -uy,
        ny: ux,
        cx: bx / 2,
        cy: by / 2,
        z0,
        z1,
        tip: Math.sqrt(radius ** 2 - (distance / 2) ** 2),
        reach: Math.sqrt((radius + BORE_EDGE_ROUND_MM) ** 2 - (distance / 2) ** 2),
      });
    }
  });
  return pairs;
}

/**
 * Cutters that round the knife edges between overlapping block bores: each
 * cutter takes the tip of the wedge off down to a circle of
 * BORE_EDGE_ROUND_MM touching both bores, so the edge becomes round and the
 * star-shaped islands on top lose their points.
 */
function boreEdgeRounding(ctx: Context, anchors: Vec3[]): Manifold[] {
  const { wasm, track, params, layout } = ctx;
  const radius = pocketRadiusAt(params, 0);
  const round = BORE_EDGE_ROUND_MM;
  const segments = segmentsFor(round, params.quality.chordTolMm);
  const cutters: Manifold[] = [];
  for (const pair of borePairs(ctx, anchors)) {
    const { anchor, nx, ny, cx, cy, tip, reach } = pair;
    const bx = 2 * cx;
    const by = 2 * cy;
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
        wasm.CrossSection.ofPolygons([area > 0 ? [apex, touchA, touchB] : [apex, touchB, touchA]]),
      );
      const disk = track(wasm.CrossSection.circle(round, segments).translate(center));
      const profile = track(triangle.subtract(disk));
      cutters.push(
        track(
          track(wasm.Manifold.extrude(profile, pair.z1 - pair.z0))
            .translate(0, 0, pair.z0)
            .rotate([layout.tiltDeg - 90, 0, 0])
            .translate(anchor[0], anchor[1], anchor[2]),
        ),
      );
    }
  }
  return cutters;
}

/**
 * Cutters that blunt the fin between two overlapping bores where it meets
 * the block top. The fin hangs from the top between the bottles; its lower
 * edge, the rounded roof-side edge of the pair, climbs at the bottle angle
 * and leaves the top in a point. Each cutter rounds that point off with a
 * circle of MOUTH_TIP_ROUND_MM touching the top and the edge, swept round
 * a vertical axis MOUTH_TIP_PLAN_MM behind the point as far as the sweep
 * stays between the rims of the two mouths, so the fin ends in a tongue
 * that curls over into the top and blends into both rims.
 */
function finTipRounding(ctx: Context, anchors: Vec3[], level: number): Manifold[] {
  const { wasm, track, params, layout } = ctx;
  const tilt = (layout.tiltDeg * Math.PI) / 180;
  const radius = pocketRadiusAt(params, 0);
  const round = MOUTH_TIP_ROUND_MM;
  const sweep = MOUTH_TIP_PLAN_MM;
  const touch = round / Math.tan(tilt / 2);
  // Profile in (distance from the axis, height above the top): the wedge
  // between the edge and the top, extended past the point, less the circle.
  const wedge = track(
    wasm.CrossSection.ofPolygons([
      [
        [sweep, 0],
        [sweep + touch - touch * Math.cos(tilt), -touch * Math.sin(tilt)],
        [sweep + touch + 1, 0],
        [sweep + touch, 1],
      ],
    ]),
  );
  const circle = track(
    wasm.CrossSection.circle(round, segmentsFor(round, params.quality.chordTolMm)).translate(
      sweep,
      -round,
    ),
  );
  const profile = track(wedge.subtract(circle));
  const segments = segmentsFor(sweep + touch, params.quality.chordTolMm);
  const cutters: Manifold[] = [];
  for (const pair of borePairs(ctx, anchors)) {
    const { anchor, nx, ny, cx, cy, reach } = pair;
    // The roof-side edge lies towards negative frame y; none for bores in line.
    const side = -Math.sign(ny);
    if (side === 0) {
      continue;
    }
    const low = reach - BORE_EDGE_ROUND_MM;
    const [ex, ey] = [cx + side * low * nx, cy + side * low * ny];
    // The lowest line of the rounded edge, where it climbs through the top.
    const along = (level - anchor[2] + ey * Math.cos(tilt)) / Math.sin(tilt);
    const apexY = anchor[1] + along * Math.cos(tilt) + ey * Math.sin(tilt);
    const axisY = apexY - touch - sweep;
    // Half width of the fin at the top between the elliptical mouths.
    const mouthY = anchor[1] + (level - anchor[2]) / Math.tan(tilt);
    const halfLength = radius / Math.sin(tilt);
    const halfWidth = (y: number) => {
      const offset = (y - mouthY) / halfLength;
      return Math.abs(ex) - radius * Math.sqrt(Math.max(0, 1 - offset * offset));
    };
    // A fin shorter than the cut gets no rounding.
    if (halfWidth(axisY + sweep) >= Math.abs(ex) - 1e-6) {
      continue;
    }
    // Sweep from the point round to each side until the circle reaches a rim.
    let reachDeg = 90;
    for (let deg = 1; deg <= 90; deg++) {
      const angle = (deg * Math.PI) / 180;
      if (sweep * Math.sin(angle) >= halfWidth(axisY + sweep * Math.cos(angle))) {
        reachDeg = deg;
        break;
      }
    }
    cutters.push(
      track(
        track(
          track(wasm.Manifold.revolve(profile, segments, 2 * reachDeg)).rotate([
            0,
            0,
            90 - reachDeg,
          ]),
        ).translate(anchor[0] + ex, axisY, level),
      ),
    );
  }
  return cutters;
}

/** Outline of `solid` at height `z`, grown by `grow`, as hull points at `z`. */
function outlineAt(ctx: Context, solid: Manifold, z: number, grow: number): Vec3[] {
  const { params, track } = ctx;
  let section = track(solid.slice(z));
  if (grow > 0) {
    section = track(section.offset(grow, 'Round', 2, segmentsFor(grow, params.quality.chordTolMm)));
  }
  return section
    .toPolygons()
    .flat()
    .map(([x, y]) => [x, y, z]);
}

/**
 * Cutter that bends the top of a tilted bore MOUTH_EASE_DEG steeper over the
 * last MOUTH_EASE_DEPTH_MM below the block top: the outline of the bore at
 * the bend height lofted to its outline above the top, shifted towards the
 * bottle bottom by what the steeper exit gains. The roof of the bore loses
 * the thin end of its lip over the bottle; the bottle rest below stays.
 */
function mouthEase(ctx: Context, bore: Manifold, level: number): Manifold | null {
  const { layout, track, wasm } = ctx;
  const tilt = (layout.tiltDeg * Math.PI) / 180;
  const steeper = Math.min(Math.PI / 2, tilt + (MOUTH_EASE_DEG * Math.PI) / 180);
  const depth = MOUTH_EASE_DEPTH_MM;
  const gain = depth * (1 / Math.tan(tilt) - 1 / Math.tan(steeper));
  const rise = depth + 2;
  const bottom = outlineAt(ctx, bore, level - depth, 0);
  const top = outlineAt(ctx, bore, level + 2, 0).map(([x, y, z]): Vec3 => [
    x,
    y - (gain * rise) / depth,
    z,
  ]);
  if (bottom.length === 0 || top.length === 0) {
    return null;
  }
  return track(wasm.Manifold.hull([...bottom, ...top]));
}

/**
 * Cutters that round the edge where a bore leaves the block top: the
 * outline of the mouth at the top, grown by MOUTH_ROUND_MM, lofted down
 * along a quarter circle profile to the plain outline MOUTH_ROUND_MM below.
 * The profile meets the top and the bore wall tangentially whatever the
 * angle between them, so a thin lip ends in a round nose.
 */
function mouthRounding(ctx: Context, mouth: Manifold, level: number): Manifold[] {
  const { params, track, wasm } = ctx;
  const round = MOUTH_ROUND_MM;
  const steps = Math.max(2, Math.ceil(segmentsFor(round, params.quality.chordTolMm) / 4));
  const rings = [outlineAt(ctx, mouth, level + 1, round)];
  for (let k = 0; k <= steps; k++) {
    const angle = (Math.PI / 2) * (k / steps);
    const depth = round * (1 - Math.cos(angle));
    rings.push(outlineAt(ctx, mouth, level - depth, round * (1 - Math.sin(angle))));
  }
  const cutters: Manifold[] = [];
  for (let i = 1; i < rings.length; i++) {
    if (rings[i - 1].length > 0 && rings[i].length > 0) {
      cutters.push(track(wasm.Manifold.hull([...rings[i - 1], ...rings[i]])));
    }
  }
  return cutters;
}

/**
 * Bottles of the drawer pattern that reach onto a rack: their supports and
 * pockets are cut from it, including bottles whose end stop sits on a
 * neighboring rack.
 */
function bottlesOnRack(
  params: PaintRackParams,
  layout: PaintRackLayout,
  rack: PaintRackModule,
  candidates: Vec3[],
): Vec3[] {
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
 * Builds one rack of the drawer as one solid: the base and a block above it
 * with a pocket per bottle, a round bore along the axis of a tilted bottle
 * or a straight well for an upright one. The rack is centered on the
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
    const bottles = bottlesOnRack(params, layout, local, [
      ...layout.bottles,
      ...layout.cutOnly,
    ]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const upright = params.orientation === 'upright';
    const region = supportRegion(ctx);
    // One level top for every row, at the height the block reaches along the bottles.
    const length = Math.min(params.supportLengthMm, params.bottle.lengthMm);
    const level = layout.bottles[0][2] + length * Math.sin((layout.tiltDeg * Math.PI) / 180);
    let block: Manifold;
    if (upright) {
      const prism = binOutlinePrism(ctx, 0, layout.pocketFloor + params.uprightDepthMm);
      block = track(prism.intersect(region));
    } else {
      block = track(region.intersect(belowHeight(ctx, level)));
    }
    const pockets: Manifold[] = [];
    for (const anchor of bottles) {
      if (upright) {
        pockets.push(uprightPocket(ctx, anchor));
        continue;
      }
      const bore = blockBore(ctx, anchor);
      const ease = params.easeMouths ? mouthEase(ctx, bore, level) : null;
      const mouth = ease === null ? bore : track(bore.add(ease));
      pockets.push(mouth);
      if (params.roundMouths) {
        pockets.push(...mouthRounding(ctx, mouth, level));
      }
    }
    if (!upright) {
      pockets.push(...boreEdgeRounding(ctx, bottles));
      if (params.roundMouths) {
        pockets.push(...finTipRounding(ctx, bottles, level));
      }
    }
    const material = track(wasm.Manifold.union([basePlate(ctx), block]));
    const result = track(material.subtract(track(wasm.Manifold.union(pockets))));
    // A tracked result is released by the geometry scope when this throws.
    const status = result.status();
    if (status !== 'NoError') {
      throw new Error(`${ERROR_INVALID_PAINT_RACK}${status}.`);
    }
    return result;
  });
}

/**
 * The share of the drawer pattern a rack can see, in its own coordinates,
 * as a sortable text: racks with equal shares build the same solid, and a
 * rack whose share is the mirror image of another's builds its mirror.
 */
function patternShare(
  params: PaintRackParams,
  layout: PaintRackLayout,
  rack: PaintRackModule,
  mirrored: boolean,
): string {
  const sign = mirrored ? -1 : 1;
  const points = bottlesOnRack(params, layout, rack, [...layout.bottles, ...layout.cutOnly])
    .map(([x, y, z]) => [sign * (x - rack.centerX), y - rack.centerY, z])
    .map((point) => point.map((value) => value.toFixed(4)).join(','))
    .sort();
  return `${rack.unitsX}x${rack.unitsY}:${points.join(';')}`;
}

/**
 * Every rack of the drawer with its solid; the caller owns the solids.
 * Racks with the same share of the pattern are built once and copied,
 * mirror images once and mirrored.
 */
export function buildPaintRacks(
  wasm: ManifoldToplevel,
  params: PaintRackParams,
  onRack?: (built: number, total: number) => void,
): { rack: PaintRackModule; solid: Manifold }[] {
  const racks = planRacks(params);
  const layout = solvePaintRack(params);
  if (layout === null) {
    throw new Error(ERROR_PAINT_RACK_UNSOLVED);
  }
  const built = new Map<string, Manifold>();
  try {
    return racks.map((rack, index) => {
      const share = patternShare(params, layout, rack, false);
      const mirrorShare = patternShare(params, layout, rack, true);
      let centered = built.get(share) ?? null;
      let mirrored = false;
      if (centered === null && built.has(mirrorShare)) {
        centered = built.get(mirrorShare) ?? null;
        mirrored = true;
      }
      if (centered === null) {
        centered = buildPaintRackModule(wasm, params, rack);
        built.set(share, centered);
      }
      onRack?.(index + 1, racks.length);
      const placed = mirrored ? centered.mirror([1, 0, 0]) : centered;
      try {
        return { rack, solid: placed.translate(rack.centerX, rack.centerY, 0) };
      } finally {
        if (mirrored) {
          placed.delete();
        }
      }
    });
  } finally {
    for (const solid of built.values()) {
      solid.delete();
    }
  }
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
