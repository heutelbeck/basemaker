import type { QualityParams } from './types.ts';
import type { ValidationIssue } from './validate.ts';

export type Vec3 = [number, number, number];

/**
 * Outer profile of a dropper bottle standing on its bottom: a cylindrical
 * body, then a neck that tapers linearly from the neck diameter at the end
 * of the body to the top diameter at the full length.
 */
export interface BottleProfile {
  bodyDiameterMm: number;
  bodyLengthMm: number;
  neckDiameterMm: number;
  topDiameterMm: number;
  lengthMm: number;
}

export type PaintRackOrientation = 'upright' | 'tilted';
export type PaintRackTiltMode = 'angle' | 'maxHeight';
export type PaintRackArrangement = 'grid' | 'staggered';
/**
 * Ribs: braced thin walls and hollow feet, the fastest and lightest print.
 * Cradles: solid supports under the supported rear part of each bottle.
 * Filled: everything below the bottles is material, closed and easy to dust.
 * Block: a solid block with a tilted round bore per bottle that holds it
 * from all sides; bores closer than their diameter run into each other.
 */
export type PaintRackFill = 'ribs' | 'cradles' | 'filled' | 'block';

/**
 * Paint bottle racks for a whole drawer of unitsX by unitsY Gridfinity
 * cells. One bottle pattern spans the drawer, and the drawer is split into
 * racks that fit the build plate; every rack is a window onto the pattern,
 * so racks of any split fit together and bottles may cross rack seams.
 * Bottles stand upright or lie tilted with their caps rising towards the
 * back of the drawer (+Y), labels and bottoms to the front. Tilted bottles sink into the Gridfinity foot cells and pass
 * the baseplate ridges with no material in between.
 */
export interface PaintRackParams {
  bottle: BottleProfile;
  clearanceMm: number;
  orientation: PaintRackOrientation;
  tiltMode: PaintRackTiltMode;
  tiltDeg: number;
  maxHeightMm: number;
  arrangement: PaintRackArrangement;
  unitsX: number;
  unitsY: number;
  gridfinity: boolean;
  baseplateHeightMm: number;
  fill: PaintRackFill;
  /** Length along a tilted bottle, from its bottom, that the supports carry. */
  supportLengthMm: number;
  /** Free room behind the drawer grid (+Y) that tilted caps may reach into. */
  frontRoomMm: number;
  /**
   * Lays tilted bottles in one row per grid unit, so identical modules
   * continue the pattern behind each other: caps reach over the module
   * behind, and the caps of the rearmost row reach freely past the grid.
   */
  tileModules: boolean;
  plateWidthMm: number;
  plateDepthMm: number;
  /** Leaves out drawer grid rows that carry no support, such as rows only caps reach over. */
  trimEmptyRows: boolean;
  wallMm: number;
  /**
   * Material between neighboring bottle pockets. Zero lets pockets touch;
   * down to minus the clearance the pockets overlap and open a gap between
   * the bottles, which then stay that clearance apart.
   */
  bottleGapMm: number;
  floorMm: number;
  uprightDepthMm: number;
  quality: QualityParams;
}

/** Caliper-measured Vallejo 17 ml dropper bottle; AK Interactive matches it. */
export const VALLEJO_BOTTLE: BottleProfile = {
  bodyDiameterMm: 24.3,
  bodyLengthMm: 58,
  neckDiameterMm: 19,
  topDiameterMm: 16,
  lengthMm: 78.5,
};

export const GRID_PITCH_MM = 42;
/**
 * Printable area assumed on the 256 mm plate of the Bambu Lab X2D, both
 * directions: a rack spanning nearly the whole plate is not practical.
 */
export const BAMBU_X2D_PLATE_MM = 240;
/** Bins are 0.5 mm smaller than their grid footprint. */
export const BIN_GAP_MM = 0.5;
export const BIN_CORNER_RADIUS_MM = 3.75;
/** Height of the Gridfinity bin foot profile: 0.8 at 45 deg, 1.8 vertical, 2.15 at 45 deg. */
export const FOOT_HEIGHT_MM = 4.75;
/** The foot cross-section is this square (half size) grown by `footRadiusAt(z)`. */
export const FOOT_CORE_HALF_MM = 17;
const BASEPLATE_PROFILE_HEIGHT_MM = 4.65;
/** Thickness of the solid end stop behind a tilted bottle's bottom. */
export const END_STOP_MM = 2.4;
/** Length along a tilted bottle, from its bottom, of the solid cup below it. */
export const BOTTOM_CUP_MM = 10;
/** Air kept between a bottle pocket and the baseplate ridge crest. */
const RIDGE_CLEARANCE_MM = 0.3;
const MIN_TILT_DEG = 5;
const MAX_TILT_DEG = 89.5;

const ERROR_PAINT_RACK_NO_FIT =
  'No bottle fits on this footprint; enlarge the grid or reduce the wall thickness.';
const ERROR_PAINT_RACK_TOO_LOW =
  'The bottles do not fit below the maximum height at any tilt; raise the maximum height.';
const ERROR_PAINT_RACK_VALUES =
  'Paint racks need a drawer of 1 to 24 grid units per side, a build plate that holds at least one grid unit, non-negative room behind the grid, a bottle whose neck and top are no wider than the body and whose body is shorter than the bottle, a clearance of 0 to 3 mm, a wall of 0.4 to 5 mm, a bottle gap from minus the clearance up to 5 mm, a floor of 0.8 to 5 mm, a tilt of 5 to 89.5 degrees, a non-negative baseplate height, an upright pocket depth of 3 to 60 mm, and a support length of 10 mm up to the bottle length.';

export function defaultPaintRackParams(): PaintRackParams {
  return {
    bottle: { ...VALLEJO_BOTTLE },
    clearanceMm: 1.2,
    orientation: 'tilted',
    tiltMode: 'maxHeight',
    tiltDeg: 35,
    maxHeightMm: 70,
    arrangement: 'grid',
    unitsX: 14,
    unitsY: 6,
    gridfinity: true,
    baseplateHeightMm: 6,
    fill: 'block',
    supportLengthMm: 35,
    frontRoomMm: 0,
    tileModules: true,
    plateWidthMm: BAMBU_X2D_PLATE_MM,
    plateDepthMm: BAMBU_X2D_PLATE_MM,
    trimEmptyRows: true,
    wallMm: 0.8,
    bottleGapMm: -0.7,
    floorMm: 1,
    uprightDepthMm: 20,
    quality: { chordTolMm: 0.05 },
  };
}

/**
 * Radius by which the foot core square is grown at height `z` above the
 * foot bottom, following the Gridfinity bin profile.
 */
export function footRadiusAt(z: number): number {
  if (z <= 0.8) {
    return 0.8 + Math.max(0, z);
  }
  if (z <= 2.6) {
    return 1.6;
  }
  return Math.min(BIN_CORNER_RADIUS_MM, 1.6 + (z - 2.6));
}

export function binSize(params: PaintRackParams): { width: number; depth: number } {
  return {
    width: params.unitsX * GRID_PITCH_MM - BIN_GAP_MM,
    depth: params.unitsY * GRID_PITCH_MM - BIN_GAP_MM,
  };
}

/** Drawer-floor height of the bin bottom: the foot sinks into the baseplate. */
function binBottomHeight(params: PaintRackParams): number {
  return params.gridfinity
    ? Math.max(0, params.baseplateHeightMm - BASEPLATE_PROFILE_HEIGHT_MM)
    : 0;
}

/** Pocket radius at axial position `s` from the bottle bottom. */
export function pocketRadiusAt(params: PaintRackParams, s: number): number {
  const { bottle, clearanceMm } = params;
  if (s <= bottle.bodyLengthMm) {
    return (bottle.bodyDiameterMm + clearanceMm) / 2;
  }
  const t = (s - bottle.bodyLengthMm) / (bottle.lengthMm - bottle.bodyLengthMm);
  const diameter = bottle.neckDiameterMm + t * (bottle.topDiameterMm - bottle.neckDiameterMm);
  return (diameter + clearanceMm) / 2;
}

/** Unit vector of the bottle axis, rising towards +Y at `tiltDeg`. */
export function axisDirection(tiltDeg: number): Vec3 {
  const angle = (tiltDeg * Math.PI) / 180;
  return [0, Math.cos(angle), Math.sin(angle)];
}

interface BottleShape {
  /**
   * Surface and end-disc samples relative to the axis start, restricted to
   * the ones low enough to ever meet the floor or a baseplate ridge.
   */
  samples: Vec3[];
  /** Height of the axis start above the lowest pocket point. */
  axisLift: number;
  /** Height of the highest pocket point above the lowest one. */
  top: number;
  /** Plan extent along Y relative to the axis start. */
  rear: number;
  front: number;
  radius: number;
}

function bottleShape(params: PaintRackParams, tiltDeg: number): BottleShape {
  const [, ay, az] = axisDirection(tiltDeg);
  const e2: Vec3 = [0, -az, ay];
  const length = params.bottle.lengthMm;
  const samples: Vec3[] = [];
  const axialSteps = Math.ceil(length / 0.75);
  const angularSteps = 64;
  const push = (s: number, r: number, phi: number) => {
    const c = r * Math.cos(phi);
    const n = r * Math.sin(phi);
    samples.push([c, s * ay + n * e2[1], s * az + n * e2[2]]);
  };
  for (let i = 0; i <= axialSteps; i++) {
    const s = (length * i) / axialSteps;
    const radii =
      Math.abs(s - params.bottle.bodyLengthMm) < length / axialSteps / 2
        ? [pocketRadiusAt(params, s - 1e-6), pocketRadiusAt(params, s + 1e-6)]
        : [pocketRadiusAt(params, s)];
    for (const r of radii) {
      for (let k = 0; k < angularSteps; k++) {
        push(s, r, (2 * Math.PI * k) / angularSteps);
      }
    }
  }
  for (const s of [0, length]) {
    const rim = pocketRadiusAt(params, s);
    for (const fraction of [0.25, 0.5, 0.75]) {
      for (let k = 0; k < angularSteps; k++) {
        push(s, rim * fraction, (2 * Math.PI * k) / angularSteps);
      }
    }
  }
  let lowest = Infinity;
  let highest = -Infinity;
  let rear = Infinity;
  let front = -Infinity;
  for (const [, y, z] of samples) {
    lowest = Math.min(lowest, z);
    highest = Math.max(highest, z);
    rear = Math.min(rear, y);
    front = Math.max(front, y);
  }
  // No floor or ridge rises above the crest, so higher samples never bind.
  const reach = lowest + FOOT_HEIGHT_MM + RIDGE_CLEARANCE_MM;
  return {
    samples: samples.filter(([, , z]) => z <= reach),
    axisLift: -lowest,
    top: highest - lowest,
    rear,
    front,
    radius: pocketRadiusAt(params, 0),
  };
}

/** Plan extent of a pocket along Y relative to its axis start. */
export function pocketPlanExtent(
  params: PaintRackParams,
  tiltDeg: number,
): { rear: number; front: number } {
  const { rear, front } = bottleShape(params, tiltDeg);
  return { rear, front };
}

/**
 * Lowest height a pocket may reach at plan position (x, y) in bin
 * coordinates. On a flat bottom that is the floor. Over a Gridfinity foot
 * the pocket may sink into the foot cell down to the floor, follows the
 * foot chamfer at a distance of one wall, and passes over the baseplate
 * ridge crest between cells with only the ridge clearance.
 */
export function floorHeightAt(params: PaintRackParams, x: number, y: number): number {
  if (!params.gridfinity) {
    return params.floorMm;
  }
  const local = (value: number, units: number) => {
    const offset = ((units - 1) * GRID_PITCH_MM) / 2;
    const index = Math.min(units - 1, Math.max(0, Math.round((value + offset) / GRID_PITCH_MM)));
    return Math.abs(value - (index * GRID_PITCH_MM - offset));
  };
  const u = Math.max(0, local(x, params.unitsX) - FOOT_CORE_HALF_MM);
  const v = Math.max(0, local(y, params.unitsY) - FOOT_CORE_HALF_MM);
  const reach = Math.hypot(u, v) + params.wallMm;
  const crest = FOOT_HEIGHT_MM + RIDGE_CLEARANCE_MM;
  let inFoot: number;
  if (reach <= 0.8) {
    inFoot = 0;
  } else if (reach <= 1.6) {
    inFoot = reach - 0.8;
  } else {
    inFoot = 2.6 + (reach - 1.6);
  }
  return Math.min(crest, Math.max(params.floorMm, inFoot));
}

export interface PaintRackLayout {
  tiltDeg: number;
  /** Axis start (bottom center) of every bottle pocket in bin coordinates. */
  bottles: Vec3[];
  /**
   * Pockets that tiled modules cut without holding a bottle there, so every
   * module matches its neighbors: the caps of the module behind and the
   * halves of the seam bottles at the side edges of the drawer.
   */
  cutOnly: Vec3[];
  /** Lateral distance between neighboring bottles in a row. */
  pitchX: number;
  /** Height of the lowest pocket point above the bin bottom. */
  pocketFloor: number;
  /** Highest bottle pocket point above the bin bottom. */
  binTop: number;
  /** Highest bottle point above the drawer floor, including the baseplate. */
  totalHeight: number;
  /** How far the bottles reach past the +Y (back) edge of the drawer grid. */
  frontOverhang: number;
}

/** One printable rack: a window of the drawer grid that fits the build plate. */
export interface PaintRackModule {
  /** Row letter from the back, column number from the left. */
  label: string;
  startX: number;
  startY: number;
  unitsX: number;
  unitsY: number;
  /** Center of the rack in drawer coordinates. */
  centerX: number;
  centerY: number;
}

/** Most grid units along one side of a rack that a plate of `plateMm` holds. */
export function maxRackUnits(plateMm: number): number {
  return Math.max(1, Math.floor((plateMm + BIN_GAP_MM) / GRID_PITCH_MM + 1e-9));
}

/** Splits `total` units into the fewest near-equal parts of at most `max` units. */
function splitUnits(total: number, max: number): number[] {
  const count = Math.ceil(total / max);
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Lateral repeat of tiled modules: `count` bottles every `units` grid
 * units, the densest whole-unit period whose pitch keeps the bottle gap,
 * so the pockets sit at the same spots in every period along the drawer.
 */
function tilePeriod(params: PaintRackParams): { units: number; count: number; pitch: number } {
  const minPitch = 2 * pocketRadiusAt(params, 0) + params.bottleGapMm;
  let best = { units: 1, count: 1, pitch: GRID_PITCH_MM };
  for (let units = 1; units <= maxRackUnits(params.plateWidthMm); units++) {
    const count = Math.floor((units * GRID_PITCH_MM) / minPitch + 1e-9);
    if (count > 0 && count / units > best.count / best.units + 1e-9) {
      best = { units, count, pitch: (units * GRID_PITCH_MM) / count };
    }
  }
  return best;
}

/**
 * Rack widths across the drawer: near-equal so print times stay balanced,
 * or for tiled modules the widest whole number of lateral periods that
 * fits the plate and the rest last, so the full modules are identical.
 */
function rackWidths(params: PaintRackParams): number[] {
  const max = maxRackUnits(params.plateWidthMm);
  if (!tilesModules(params)) {
    return splitUnits(params.unitsX, max);
  }
  return periodSplit(params.unitsX, max, tilePeriod(params).units);
}

/**
 * Splits `total` rows of staggered tiled modules into the fewest equal
 * racks of an even depth, so every rack starts on a row of the same kind
 * and all racks match; falls back to whole row pairs and the rest last.
 */
function evenSplit(total: number, max: number): number[] {
  for (let count = Math.ceil(total / max); count <= total; count++) {
    const depth = total / count;
    if (Number.isInteger(depth) && depth % 2 === 0 && depth <= max) {
      return Array.from({ length: count }, () => depth);
    }
  }
  return periodSplit(total, max, 2);
}

/**
 * Splits `total` units into racks of the most whole periods of `period`
 * units that fit `max`, and the rest last.
 */
function periodSplit(total: number, max: number, period: number): number[] {
  const full = Math.max(1, Math.floor(max / period)) * period;
  const parts: number[] = Array.from({ length: Math.floor(total / full) }, () => full);
  if (total % full > 0) {
    parts.push(total % full);
  }
  return parts;
}

/**
 * Lateral bottle positions of a tiled row, on the pattern anchored at the
 * left edge of the drawer. Seam rows put a bottle on every period boundary,
 * so a bottle sits exactly half on each rack of a seam. Beside racks of
 * whole periods, positions whose bottle would leave the drawer but whose
 * pocket reaches into it are only cut, so those outer racks see the same
 * neighbors as the inner ones.
 */
function tiledRowXs(params: PaintRackParams, seamRow: boolean): { xs: number[]; edges: number[] } {
  const { pitch, units } = tilePeriod(params);
  const widths = rackWidths(params);
  // Only racks of whole periods match their neighbors; a narrower rest
  // leaves the openings at the drawer side out.
  const wholeLeft = widths[0] % units === 0;
  const wholeRight = widths[widths.length - 1] % units === 0;
  const half = (params.unitsX * GRID_PITCH_MM) / 2;
  const body = params.bottle.bodyDiameterMm / 2;
  const reach = pocketRadiusAt(params, 0) + 1;
  const xs: number[] = [];
  const edges: number[] = [];
  const first = Math.floor(-reach / pitch) - 1;
  for (let k = first; ; k++) {
    const x = -half + (k + (seamRow ? 0 : 0.5)) * pitch;
    if (x > half + reach) {
      break;
    }
    // As at every seam, an outermost pocket may open through the side wall
    // as long as the bottle itself stays on the grid.
    if (Math.abs(x) + body <= half + 1e-6) {
      xs.push(x);
    } else if (Math.abs(x) < half + reach && (x < 0 ? wholeLeft : wholeRight)) {
      edges.push(x);
    }
  }
  return { xs, edges };
}

/**
 * Drawer grid rows, counted from the back, that carry support material.
 * All rows when trimming is off or no bottle fits.
 */
function supportedRows(params: PaintRackParams): { first: number; count: number } {
  const layout = solvePaintRack(params);
  if (!params.trimEmptyRows || layout === null) {
    return { first: 0, count: params.unitsY };
  }
  const shape = bottleShape(params, layout.tiltDeg);
  const tilted = params.orientation === 'tilted';
  const rearRoom = tilted ? END_STOP_MM + params.wallMm : params.wallMm;
  const ys = layout.bottles.map(([, y]) => y);
  const rear = Math.min(...ys) + shape.rear - rearRoom;
  const front =
    Math.max(...ys) + (tilted ? supportFront(params, layout.tiltDeg) : shape.front + params.wallMm);
  const toRow = (y: number) => y / GRID_PITCH_MM + params.unitsY / 2;
  const first = Math.min(params.unitsY - 1, Math.max(0, Math.floor(toRow(rear) + 1e-9)));
  const last = Math.min(params.unitsY, Math.max(first + 1, Math.ceil(toRow(front) - 1e-9)));
  return { first, count: last - first };
}

/**
 * Splits the drawer into the fewest racks that fit the build plate, with
 * near-equal sizes so print times stay balanced.
 */
export function planRacks(params: PaintRackParams): PaintRackModule[] {
  const rows = supportedRows(params);
  const widths = rackWidths(params);
  const maxDepth = maxRackUnits(params.plateDepthMm);
  const depths =
    tilesModules(params) && params.arrangement === 'staggered'
      ? evenSplit(rows.count, maxDepth)
      : splitUnits(rows.count, maxDepth);
  const racks: PaintRackModule[] = [];
  let startY = rows.first;
  depths.forEach((unitsY, row) => {
    let startX = 0;
    widths.forEach((unitsX, column) => {
      racks.push({
        label: `${String.fromCharCode(65 + row)}${column + 1}`,
        startX,
        startY,
        unitsX,
        unitsY,
        centerX: (startX + unitsX / 2 - params.unitsX / 2) * GRID_PITCH_MM,
        centerY: (startY + unitsY / 2 - params.unitsY / 2) * GRID_PITCH_MM,
      });
      startX += unitsX;
    });
    startY += unitsY;
  });
  return racks;
}

/** Whether a bottle's axis start, where its end stop sits, lies on the rack. */
export function rackHoldsBottle(rack: PaintRackModule, [x, y]: Vec3): boolean {
  const halfX = (rack.unitsX * GRID_PITCH_MM) / 2;
  const halfY = (rack.unitsY * GRID_PITCH_MM) / 2;
  return (
    x >= rack.centerX - halfX &&
    x < rack.centerX + halfX &&
    y >= rack.centerY - halfY &&
    y < rack.centerY + halfY
  );
}

function rowPositions(
  count: number,
  pitch: number,
  center: number,
  limit: number,
  radius: number,
): number[] {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = center + (i - (count - 1) / 2) * pitch;
    if (Math.abs(x) + radius <= limit + 1e-9) {
      positions.push(x);
    }
  }
  return positions;
}

/**
 * Bottle positions for a given tilt with the lateral and depth offsets of
 * the pattern, before lifting: rows of bottles at the lateral pitch,
 * every second row shifted by half a pitch when staggered.
 */
function placeBottles(
  params: PaintRackParams,
  shape: BottleShape,
  tiltDeg: number,
  pitchX: number,
  offsetX: number,
  offsetY: number,
): {
  centers: [number, number][];
  cutOnly: [number, number][];
  slackX: number;
  slackY: number;
} {
  const { depth } = binSize(params);
  const wall = params.wallMm;
  const radius = shape.radius;
  const minPitch = 2 * radius + params.bottleGapMm;
  const tiles = tilesModules(params);
  const pitch = tiles ? tilePeriod(params).pitch : Math.max(minPitch, pitchX);
  const limitX = lateralLimit(params);
  const sin = Math.sin((tiltDeg * Math.PI) / 180);
  const staggered = params.arrangement === 'staggered';
  // Bottles in neighboring staggered rows sit half a lateral pitch apart,
  // so the rows only need the remaining distance across.
  const perpendicular = staggered
    ? Math.sqrt(Math.max(0, minPitch ** 2 - (pitch / 2) ** 2))
    : minPitch;
  const needed = params.orientation === 'upright' ? perpendicular : perpendicular / sin;
  if (tiles && needed > GRID_PITCH_MM + 1e-9) {
    return { centers: [], cutOnly: [], slackX: 0, slackY: 0 };
  }
  const rowPitch = tiles ? GRID_PITCH_MM : needed;
  const columns = columnCount(params, shape);
  const slackX = tiles ? 0 : Math.max(0, 2 * limitX - 2 * radius - (columns - 1) * pitch);
  const rowXs = (row: number): { xs: number[]; edges: number[] } => {
    if (tiles) {
      return tiledRowXs(params, staggered && Math.abs(row % 2) === 1);
    }
    // One more position around the same center is the half-pitch shifted
    // set; the bounds check drops the ends that do not fit.
    const count = staggered && row % 2 === 1 ? columns + 1 : columns;
    return { xs: rowPositions(count, pitch, offsetX, limitX, radius), edges: [] };
  };
  // Tilted bottles keep room for their end stop at the rear edge.
  const rearRoom = params.orientation === 'tilted' ? END_STOP_MM + wall : wall;
  const firstY = -depth / 2 + rearRoom - shape.rear;
  const { lastAllowed, rows } = rowFit(params, shape, tiltDeg, firstY, rowPitch);
  const slackY = rows > 0 ? lastAllowed - firstY - (rows - 1) * rowPitch : 0;
  const centers: [number, number][] = [];
  const cutOnly: [number, number][] = [];
  for (let row = 0; row < rows; row++) {
    const y = firstY + offsetY + row * rowPitch;
    const { xs, edges } = rowXs(row);
    for (const x of xs) {
      centers.push([x, y]);
    }
    for (const x of edges) {
      cutOnly.push([x, y]);
    }
  }
  if (tiles) {
    // The pattern continues behind the drawer, where the caps of another
    // module behind reach over the rearmost rows.
    const reachRows = Math.ceil(params.bottle.lengthMm / rowPitch);
    for (let row = -reachRows; row < 0; row++) {
      const y = firstY + offsetY + row * rowPitch;
      const { xs, edges } = rowXs(row);
      for (const x of [...xs, ...edges]) {
        cutOnly.push([x, y]);
      }
    }
  }
  return { centers, cutOnly, slackX, slackY };
}

/**
 * Plan extent, from the axis start, of a tilted bottle's supports: the ribs
 * and the last brace end one wall past the support length.
 */
function supportFront(params: PaintRackParams, tiltDeg: number): number {
  const length = Math.min(params.supportLengthMm, params.bottle.lengthMm);
  return length * Math.cos((tiltDeg * Math.PI) / 180) + params.wallMm;
}

/**
 * Last allowed axis start and the number of rows. Upright bottles must lie
 * inside the drawer grid. Tilted bottles need their supports inside it,
 * and their caps may reach into the free room behind the grid.
 */
function rowFit(
  params: PaintRackParams,
  shape: BottleShape,
  tiltDeg: number,
  firstY: number,
  rowPitch: number,
): { lastAllowed: number; rows: number } {
  const halfDepth = binSize(params).depth / 2;
  const capRoom = tilesModules(params) ? Infinity : params.frontRoomMm;
  const lastAllowed =
    params.orientation === 'upright'
      ? halfDepth - params.wallMm - shape.front
      : Math.min(halfDepth - supportFront(params, tiltDeg), halfDepth + capRoom - shape.front);
  const rows = lastAllowed >= firstY ? Math.floor((lastAllowed - firstY) / rowPitch + 1e-9) + 1 : 0;
  return { lastAllowed, rows };
}

/** Whether the bottle rows repeat with every grid unit of depth. */
export function tilesModules(params: PaintRackParams): boolean {
  return params.tileModules && params.orientation === 'tilted';
}

/** Farthest a pocket edge may reach sideways from the drawer center. */
function lateralLimit(params: PaintRackParams): number {
  return binSize(params).width / 2 - params.bottleGapMm / 2;
}

function columnCount(params: PaintRackParams, shape: BottleShape): number {
  const limitX = lateralLimit(params);
  const minPitch = 2 * shape.radius + params.bottleGapMm;
  return Math.max(0, Math.floor((2 * limitX - 2 * shape.radius) / minPitch + 1e-9) + 1);
}

/** Widest lateral pitch that still fits all columns of a row. */
function maxPitch(params: PaintRackParams, shape: BottleShape): number {
  const columns = columnCount(params, shape);
  const minPitch = 2 * shape.radius + params.bottleGapMm;
  if (columns < 2) {
    return minPitch;
  }
  const limitX = lateralLimit(params);
  return Math.max(minPitch, (2 * limitX - 2 * shape.radius) / (columns - 1));
}

function pocketFloorFor(
  params: PaintRackParams,
  shape: BottleShape,
  centers: [number, number][],
): number {
  let floor = params.floorMm;
  for (const [cx, cy] of centers) {
    for (const [sx, sy, sz] of shape.samples) {
      const required = floorHeightAt(params, cx + sx, cy + sy) - (sz + shape.axisLift);
      if (required > floor) {
        floor = required;
      }
    }
  }
  return floor;
}

interface Candidate {
  centers: [number, number][];
  cutOnly: [number, number][];
  floor: number;
  pitchX: number;
  offsetX: number;
}

/** More bottles first, then a lower pocket floor, then wider spread, then centered. */
function better(a: Candidate, b: Candidate | null): boolean {
  if (b === null) {
    return true;
  }
  if (a.centers.length !== b.centers.length) {
    return a.centers.length > b.centers.length;
  }
  if (Math.abs(a.floor - b.floor) > 1e-6) {
    return a.floor < b.floor;
  }
  if (Math.abs(a.pitchX - b.pitchX) > 1e-6) {
    return a.pitchX > b.pitchX;
  }
  return Math.abs(a.offsetX) < Math.abs(b.offsetX);
}

/**
 * Lays the bottles out at a fixed tilt. The lateral pitch spreads the
 * columns up to the full width, and on Gridfinity feet the pattern is
 * shifted within its slack, choosing the spread and offsets that let the
 * bottles sink deepest into the foot cells. Lateral and depth placement
 * are searched alternately, which is enough because longitudinal and
 * transverse ridges bind different bottles.
 */
function layoutAt(params: PaintRackParams, tiltDeg: number): PaintRackLayout | null {
  const shape = bottleShape(params, tiltDeg);
  const minPitch = 2 * shape.radius + params.bottleGapMm;
  // Overlapping pockets keep their overlap rather than spreading apart.
  const widest = params.bottleGapMm < 0 ? minPitch : maxPitch(params, shape);
  const steps = params.gridfinity ? 6 : 0;
  let pitches = [widest];
  if (steps > 0) {
    pitches = Array.from(
      { length: steps + 1 },
      (_, i) => minPitch + ((widest - minPitch) * i) / steps,
    );
  }
  const evaluate = (pitchX: number, offsetX: number, offsetY: number): Candidate | null => {
    const { centers, cutOnly } = placeBottles(params, shape, tiltDeg, pitchX, offsetX, offsetY);
    if (centers.length === 0) {
      return null;
    }
    return {
      centers,
      cutOnly,
      floor: pocketFloorFor(params, shape, centers),
      pitchX,
      offsetX,
    };
  };
  const fractions = Array.from({ length: steps + 1 }, (_, i) => (steps === 0 ? 0.5 : i / steps));
  let best: Candidate | null = null;
  let bestDepthFraction = 0.5;
  const searchLateral = (depthFraction: number) => {
    for (const pitchX of pitches) {
      const { slackX, slackY } = placeBottles(params, shape, tiltDeg, pitchX, 0, 0);
      for (const fraction of fractions) {
        const candidate = evaluate(pitchX, slackX * (fraction - 0.5), slackY * depthFraction);
        if (candidate !== null && better(candidate, best)) {
          best = candidate;
          bestDepthFraction = depthFraction;
        }
      }
    }
  };
  searchLateral(0.5);
  if (best === null) {
    return null;
  }
  const lateral: Candidate = best;
  const { slackY } = placeBottles(params, shape, tiltDeg, lateral.pitchX, 0, 0);
  for (const fraction of fractions) {
    const candidate = evaluate(lateral.pitchX, lateral.offsetX, slackY * fraction);
    if (candidate !== null && better(candidate, best)) {
      best = candidate;
      bestDepthFraction = fraction;
    }
  }
  searchLateral(bestDepthFraction);
  const chosen: Candidate = best;
  const bottomZ = chosen.floor + shape.axisLift;
  const binTop = chosen.floor + shape.top;
  return {
    tiltDeg,
    bottles: chosen.centers.map(([x, y]) => [x, y, bottomZ]),
    cutOnly: chosen.cutOnly.map(([x, y]) => [x, y, bottomZ]),
    pitchX: chosen.pitchX,
    pocketFloor: chosen.floor,
    binTop,
    totalHeight: binBottomHeight(params) + binTop,
    frontOverhang: Math.max(
      0,
      Math.max(...chosen.centers.map(([, y]) => y)) + shape.front - binSize(params).depth / 2,
    ),
  };
}

let cachedKey = '';
let cachedLayout: PaintRackLayout | null = null;

/**
 * Solves the bottle layout: upright bottles stand at 90 degrees, tilted
 * bottles use the given angle or, in max-height mode, the steepest tilt
 * whose highest bottle point stays within the maximum height above the
 * drawer floor. Returns null when no bottle fits.
 */
export function solvePaintRack(params: PaintRackParams): PaintRackLayout | null {
  const key = JSON.stringify({ ...params, quality: null });
  if (key === cachedKey) {
    return cachedLayout;
  }
  cachedKey = key;
  cachedLayout = solveUncached(params);
  return cachedLayout;
}

function solveUncached(params: PaintRackParams): PaintRackLayout | null {
  if (params.orientation === 'upright') {
    return layoutAt(params, 90);
  }
  if (params.tiltMode === 'angle') {
    return layoutAt(params, params.tiltDeg);
  }
  const fits = (tilt: number) => {
    const layout = layoutAt(params, tilt);
    return layout !== null && layout.totalHeight <= params.maxHeightMm ? layout : null;
  };
  // Even with every pocket on the floor, a steeper tilt than this would
  // exceed the height, so the search starts just above it.
  const bestCase = (tilt: number) =>
    binBottomHeight(params) + params.floorMm + bottleShape(params, tilt).top <= params.maxHeightMm;
  let low = MIN_TILT_DEG;
  let high = MAX_TILT_DEG;
  for (let i = 0; i < 16; i++) {
    const middle = (low + high) / 2;
    if (bestCase(middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const start = Math.min(MAX_TILT_DEG, Math.floor(high * 2) / 2);
  for (let tilt = start; tilt >= MIN_TILT_DEG; tilt -= 0.5) {
    const coarse = fits(tilt);
    if (coarse !== null) {
      for (let fine = Math.min(MAX_TILT_DEG, tilt + 0.45); fine > tilt; fine -= 0.05) {
        const refined = fits(Math.round(fine * 100) / 100);
        if (refined !== null) {
          return refined;
        }
      }
      return coarse;
    }
  }
  return null;
}

export function validatePaintRack(params: PaintRackParams): ValidationIssue[] {
  const { bottle } = params;
  const valid =
    Number.isInteger(params.unitsX) &&
    Number.isInteger(params.unitsY) &&
    params.unitsX >= 1 &&
    params.unitsX <= 24 &&
    params.unitsY >= 1 &&
    params.unitsY <= 24 &&
    params.plateWidthMm >= GRID_PITCH_MM - BIN_GAP_MM &&
    params.plateDepthMm >= GRID_PITCH_MM - BIN_GAP_MM &&
    params.frontRoomMm >= 0 &&
    bottle.bodyDiameterMm > 0 &&
    bottle.neckDiameterMm > 0 &&
    bottle.topDiameterMm > 0 &&
    bottle.neckDiameterMm <= bottle.bodyDiameterMm &&
    bottle.topDiameterMm <= bottle.bodyDiameterMm &&
    bottle.bodyLengthMm > 0 &&
    bottle.bodyLengthMm < bottle.lengthMm &&
    params.clearanceMm >= 0 &&
    params.clearanceMm <= 3 &&
    params.wallMm >= 0.4 &&
    params.wallMm <= 5 &&
    params.bottleGapMm >= -params.clearanceMm &&
    params.bottleGapMm <= 5 &&
    params.floorMm >= 0.8 &&
    params.floorMm <= 5 &&
    params.tiltDeg >= MIN_TILT_DEG &&
    params.tiltDeg <= MAX_TILT_DEG &&
    params.baseplateHeightMm >= 0 &&
    params.uprightDepthMm >= 3 &&
    params.uprightDepthMm <= 60 &&
    params.supportLengthMm >= 10 &&
    params.supportLengthMm <= bottle.lengthMm;
  if (!valid) {
    return [{ code: 'paint-rack-values', message: ERROR_PAINT_RACK_VALUES }];
  }
  if (solvePaintRack(params) !== null) {
    return [];
  }
  // Flat tilts cannot tile and steep ones may not fit, so any tilt that
  // fits a bottle shows that only the height limit is in the way.
  const sampleTilts = [MIN_TILT_DEG, 15, 25, 35, 45, 60, 75, MAX_TILT_DEG];
  const heightLimited =
    params.orientation === 'tilted' &&
    params.tiltMode === 'maxHeight' &&
    sampleTilts.some((tilt) => layoutAt(params, tilt) !== null);
  return heightLimited
    ? [{ code: 'paint-rack-height', message: ERROR_PAINT_RACK_TOO_LOW }]
    : [{ code: 'paint-rack-fit', message: ERROR_PAINT_RACK_NO_FIT }];
}
