import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import type { RulerParams } from '../params/ruler.ts';
import type { Point2 } from '../params/tessellation.ts';
import { withGeometryScope } from './dispose.ts';
import type { Track } from './dispose.ts';
import { textLineContourGroups } from './lettering/textOutlines.ts';

const ERROR_INVALID_RULER = 'The generated ruler is not a valid manifold: ';

/** Flush accent inlay depth into the top face. */
const INLAY_DEPTH = 0.6;
/** Accent frame band width along the outline. */
const FRAME_WIDTH = 1.2;
/** Accent divider line width between cells. */
const DIVIDER_WIDTH = 0.8;
/**
 * Dovetail dimensions for split sticks. The lateral clearance is a snug
 * glue fit; the tip relief deepens the slot so the tab never bottoms out
 * and the butt faces of the pieces always close to the exact length.
 */
const DOVETAIL_NECK = 3;
const DOVETAIL_HEAD = 5.5;
const DOVETAIL_DEPTH = 3.8;
const DOVETAIL_CLEARANCE = 0.05;
const DOVETAIL_TIP_RELIEF = 0.1;
/**
 * Press-fit snap rivet. The shaft fills the hole up to a 0.2 mm diametral
 * running fit; the slit cap flexes inward, snaps through the hole with
 * 0.5 mm diametral interference, and its 0.25 mm ledge locks under the
 * top counterbore while leaving 0.1 mm axial float for free rotation.
 * The slit stops well above the shaft base, so the root stays a solid
 * full circle reinforced by a small fillet.
 */
const PIN_RADIUS = 2.5;
const RIVET_RUN_CLEARANCE = 0.1;
const RIVET_CAP_RADIUS = 2.85;
const RIVET_CAP_TIP_RADIUS = 2.3;
const RIVET_CAP_HEIGHT = 1;
const RIVET_SLIT_WIDTH = 1.2;
const RIVET_SLIT_ROOT = 1;
const RIVET_ROOT_FILLET = 0.2;
const RIVET_BORE_DEPTH = RIVET_CAP_HEIGHT + 0.15;
/** Magnet pocket clearances. */
const MAGNET_RADIAL_CLEARANCE = 0.15;
const MAGNET_DEPTH_CLEARANCE = 0.1;

export interface RulerPart {
  name: string;
  solid: Manifold;
  accent: boolean;
  group: string;
}

function roundedRect(
  wasm: ManifoldToplevel,
  track: Track,
  length: number,
  width: number,
  radius: number,
): CrossSection {
  const core = track(
    wasm.CrossSection.square([length - 2 * radius, width - 2 * radius], true),
  );
  return track(core.offset(radius, 'Round', 2, 32));
}

function stadium(
  wasm: ManifoldToplevel,
  track: Track,
  flankLength: number,
  width: number,
): CrossSection {
  const core = track(wasm.CrossSection.square([flankLength, 0.01], true));
  return track(core.offset(width / 2, 'Round', 2, 48));
}

function glyphSections(
  wasm: ManifoldToplevel,
  track: Track,
  font: Font,
  text: string,
  sizeMm: number,
): CrossSection[] {
  return textLineContourGroups(font, text, sizeMm).map((group) =>
    track(
      wasm.CrossSection.ofPolygons(
        group.map((contour) => contour.points),
        'EvenOdd',
      ),
    ),
  );
}

/**
 * Label centered at (x, y). Rotated labels read along the ruler (so
 * two-digit numbers fit narrow sticks); upright labels read across it.
 */
function labelSection(
  wasm: ManifoldToplevel,
  track: Track,
  font: Font,
  text: string,
  sizeMm: number,
  x: number,
  y: number,
  rotate: boolean,
): CrossSection {
  const glyphs = glyphSections(wasm, track, font, text, sizeMm);
  const merged = glyphs.reduce((union, glyph) => track(union.add(glyph)));
  const centered = track(merged.translate(0, -sizeMm / 2));
  const oriented = rotate ? track(centered.rotate(90)) : centered;
  return track(oriented.translate(x, y));
}

function dovetailSection(
  wasm: ManifoldToplevel,
  track: Track,
  cutX: number,
  grow: number,
  tipRelief = 0,
): CrossSection {
  const neck = DOVETAIL_NECK / 2 + grow;
  const head = DOVETAIL_HEAD / 2 + grow;
  const depth = DOVETAIL_DEPTH;
  const points: Point2[] = [
    [cutX, -neck],
    [cutX + depth, -head],
    ...(tipRelief > 0
      ? ([
          [cutX + depth + tipRelief, -head],
          [cutX + depth + tipRelief, head],
        ] as Point2[])
      : []),
    [cutX + depth, head],
    [cutX, neck],
  ];
  return track(wasm.CrossSection.ofPolygons([points]));
}

/**
 * All printable parts of a ruler. Sticks return one body per glued piece
 * plus one accent inlay per piece; segments return the link body and its
 * accent. The caller owns every returned manifold.
 */
export function buildRulerParts(
  wasm: ManifoldToplevel,
  params: RulerParams,
  font: Font,
): RulerPart[] {
  return withGeometryScope((track) => {
    const parts =
      params.variant === 'stick'
        ? buildStick(wasm, track, params, font)
        : buildChain(wasm, track, params, font);
    for (const part of parts) {
      const status = part.solid.status();
      if (status !== 'NoError') {
        for (const cleanup of parts) {
          cleanup.solid.delete();
        }
        throw new Error(`${ERROR_INVALID_RULER}${status}.`);
      }
    }
    return centerParts(parts);
  });
}

/** Centers the whole set of parts on the origin so it lands mid-plate. */
function centerParts(parts: RulerPart[]): RulerPart[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    const box = part.solid.boundingBox();
    minX = Math.min(minX, box.min[0]);
    maxX = Math.max(maxX, box.max[0]);
    minY = Math.min(minY, box.min[1]);
    maxY = Math.max(maxY, box.max[1]);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  if (Math.abs(centerX) < 1e-6 && Math.abs(centerY) < 1e-6) {
    return parts;
  }
  return parts.map((part) => {
    const moved = part.solid.translate(-centerX, -centerY, 0);
    part.solid.delete();
    return { ...part, solid: moved };
  });
}

function buildStick(
  wasm: ManifoldToplevel,
  track: Track,
  params: RulerParams,
  font: Font,
): RulerPart[] {
  const length = params.units * params.unitLengthMm;
  const width = params.widthMm;
  const outline = roundedRect(wasm, track, length, width, 1.5);
  const inner = track(outline.offset(-FRAME_WIDTH, 'Round', 2, 16));
  const frame = track(outline.subtract(inner));
  const accentPieces: CrossSection[] = [frame];
  const startX = -length / 2;
  for (let cell = 1; cell < params.units; cell++) {
    const x = startX + cell * params.unitLengthMm;
    const divider = track(wasm.CrossSection.square([DIVIDER_WIDTH, width - 1.6], true));
    accentPieces.push(track(divider.translate(x, 0)));
  }
  const numberSize = Math.min(width * 0.55, params.unitLengthMm * 0.5);
  for (let cell = 0; cell < params.units; cell++) {
    const x = startX + (cell + 0.5) * params.unitLengthMm;
    accentPieces.push(
      labelSection(wasm, track, font, String(cell + 1), numberSize, x, 0, params.rotateNumbers),
    );
  }
  const accentSection = track(wasm.CrossSection.union(accentPieces));
  const clippedAccent = track(accentSection.intersect(outline));

  const cutXs: number[] = [];
  if (params.splitEveryUnits > 0 && params.splitEveryUnits < params.units) {
    for (let cell = params.splitEveryUnits; cell < params.units; cell += params.splitEveryUnits) {
      cutXs.push(startX + cell * params.unitLengthMm);
    }
  }

  const bodySections: CrossSection[] = [];
  if (cutXs.length === 0) {
    bodySections.push(outline);
  } else {
    const edges = [-length / 2, ...cutXs, length / 2];
    for (let i = 0; i + 1 < edges.length; i++) {
      const band = track(
        wasm.CrossSection.square([edges[i + 1] - edges[i], width + 4], true),
      );
      let piece = track(outline.intersect(track(band.translate((edges[i] + edges[i + 1]) / 2, 0))));
      if (i + 1 < edges.length - 1) {
        const tab = dovetailSection(wasm, track, edges[i + 1], 0);
        piece = track(piece.add(track(tab.intersect(outline))));
      }
      if (i > 0) {
        const slot = dovetailSection(wasm, track, edges[i], DOVETAIL_CLEARANCE, DOVETAIL_TIP_RELIEF);
        piece = track(piece.subtract(slot));
      }
      bodySections.push(piece);
    }
  }

  const parts: RulerPart[] = [];
  const edges = [-length / 2, ...cutXs, length / 2];
  bodySections.forEach((section, index) => {
    const rowShift = index * (width + 4);
    const leftAlign = edges[0] - edges[index];
    const solid = track(
      track(wasm.Manifold.extrude(section, params.thicknessMm)).translate(leftAlign, rowShift, 0),
    );
    const accentHere = track(
      track(clippedAccent.intersect(section)).translate(leftAlign, rowShift),
    );
    const suffix = bodySections.length > 1 ? `-${index + 1}` : '';
    if (accentHere.toPolygons().length > 0) {
      const inlayCut = track(wasm.Manifold.extrude(accentHere, INLAY_DEPTH + 0.01));
      const placedCut = track(inlayCut.translate(0, 0, params.thicknessMm - INLAY_DEPTH));
      parts.push({
        name: `stick${suffix}`,
        solid: solid.subtract(placedCut),
        accent: false,
        group: `piece${suffix || '-1'}`,
      });
      const inlay = track(wasm.Manifold.extrude(accentHere, INLAY_DEPTH));
      parts.push({
        name: `accent${suffix}`,
        solid: inlay.translate(0, 0, params.thicknessMm - INLAY_DEPTH),
        accent: true,
        group: `piece${suffix || '-1'}`,
      });
    } else {
      parts.push({
        name: `stick${suffix}`,
        solid: solid.translate(0, 0, 0),
        accent: false,
        group: `piece${suffix || '-1'}`,
      });
    }
  });
  return parts;
}

/**
 * Chain links, printed separately and assembled by hand. Each numbered
 * pill measures exactly one unit tip to tip. With one pivot per joint,
 * the pill's leading end continues down into an integrated tail whose
 * press-fit snap rivet enters the next pill's hole from below: the
 * chamfered cap snaps through and seats flush in the top counterbore
 * while the shaft keeps a running fit. Two pivots per joint use separate
 * straps with a rivet at each end. The magnet option replaces rivets
 * with vertical pockets at the same pivots. The rebate that receives a
 * neighbor's tail ends in a straight wall one tail radius past the pivot,
 * so the tail swings freely past ninety degrees; a 45 degree ramp at the
 * wall roots the roof for printing. Links are laid out in rows on the
 * plate.
 */
function buildChain(
  wasm: ManifoldToplevel,
  track: Track,
  params: RulerParams,
  font: Font,
): RulerPart[] {
  const width = params.widthMm;
  const unit = params.unitLengthMm;
  const thickness = params.thicknessMm;
  const magnet = params.connector === 'magnet';
  const numberSize = Math.min(width * 0.55, unit * 0.4);
  const magnetPocketDepth = params.magnetHeightMm + MAGNET_DEPTH_CLEARANCE;
  const tailT = magnet ? magnetPocketDepth + 0.8 : 1.4;
  const fitGap = 0.15;
  const pillGap = 0.4;
  const pocketH = tailT + fitGap;
  const pillT = thickness - pocketH;
  const singlePivot = params.pivotsPerJoint === 1;
  const rowPitch = width + 5;

  const tailReach = pillGap + width;
  const strapRadius = width / 2 - 1;
  const pocketRadius = params.magnetDiameterMm / 2 + MAGNET_RADIAL_CLEARANCE;
  const pivotCircle = track(wasm.CrossSection.circle(strapRadius, 48));

  const lengthFor = (index: number): number => {
    const startInset = index > 0 ? pillGap / 2 : 0;
    const endInset = index < params.units - 1 ? pillGap / 2 : 0;
    return unit - startInset - endInset;
  };
  const outlineCache = new Map<number, CrossSection>();
  const pillOutlineFor = (length: number): CrossSection => {
    const key = Math.round(length * 1000);
    let outline = outlineCache.get(key);
    if (outline === undefined) {
      outline = stadium(wasm, track, length - width, width);
      outlineCache.set(key, outline);
    }
    return outline;
  };

  const addRivet = (solid: Manifold, x: number, y: number): Manifold => {
    const capTop = tailT + fitGap + pillT - 0.05;
    const shaft = track(
      wasm.Manifold.cylinder(capTop - RIVET_CAP_HEIGHT - tailT, PIN_RADIUS, PIN_RADIUS, 32, false),
    );
    let joined = track(solid.add(track(shaft.translate(x, y, tailT))));
    const fillet = track(
      wasm.Manifold.cylinder(
        RIVET_ROOT_FILLET,
        PIN_RADIUS + RIVET_ROOT_FILLET,
        PIN_RADIUS,
        32,
        false,
      ),
    );
    joined = track(joined.add(track(fillet.translate(x, y, tailT))));
    const cap = track(
      wasm.Manifold.cylinder(RIVET_CAP_HEIGHT, RIVET_CAP_RADIUS, RIVET_CAP_TIP_RADIUS, 32, false),
    );
    joined = track(joined.add(track(cap.translate(x, y, capTop - RIVET_CAP_HEIGHT))));
    const slitBottom = tailT + RIVET_SLIT_ROOT;
    const slit = track(
      wasm.Manifold.cube([RIVET_SLIT_WIDTH, 2 * RIVET_CAP_RADIUS + 2, capTop - slitBottom + 0.02], true),
    );
    return track(
      joined.subtract(track(slit.translate(x, y, (slitBottom + capTop) / 2 + 0.01))),
    );
  };
  const addTailPocket = (solid: Manifold, x: number, y: number): Manifold => {
    const pocket = track(
      wasm.Manifold.cylinder(magnetPocketDepth + 0.01, pocketRadius, pocketRadius, 32, false),
    );
    return track(solid.subtract(track(pocket.translate(x, y, tailT - magnetPocketDepth))));
  };
  const wallReach = strapRadius + 0.3;
  const wedgeH = magnet ? 0 : Math.min(0.5, pillT - 0.8);
  const underPocket = (pill: Manifold, localX: number, tipward: 1 | -1): Manifold => {
    const wall = localX - tipward * wallReach;
    const far = localX + tipward * (width / 2 + 2);
    const hy = width / 2 + 1;
    const top = pocketH + wedgeH;
    const corners: [number, number][] = [
      [far, -0.02],
      [wall, -0.02],
      [wall, pocketH],
      [wall + tipward * wedgeH, top],
      [far, top],
    ];
    const points: [number, number, number][] = corners.flatMap(([x, z]) => [
      [x, -hy, z],
      [x, hy, z],
    ]);
    const cut = track(wasm.Manifold.hull(points));
    return track(pill.subtract(cut));
  };

  const parts: RulerPart[] = [];
  for (let index = 0; index < params.units; index++) {
    const length = lengthFor(index);
    const pillOutline = pillOutlineFor(length);
    const pillFrame = track(
      pillOutline.subtract(track(pillOutline.offset(-FRAME_WIDTH, 'Round', 2, 16))),
    );
    const pivotOffset = length / 2 - width / 2;
    let body = track(wasm.Manifold.extrude(pillOutline, thickness));

    const receiving: number[] = [];
    if (index > 0) {
      receiving.push(-pivotOffset);
    }
    if (!singlePivot && index < params.units - 1) {
      receiving.push(pivotOffset);
    }
    for (const localX of receiving) {
      body = underPocket(body, localX, localX < 0 ? -1 : 1);
      if (magnet) {
        const pocket = track(
          wasm.Manifold.cylinder(magnetPocketDepth + 0.01, pocketRadius, pocketRadius, 32, false),
        );
        body = track(
          body.subtract(track(pocket.translate(localX, 0, pocketH - 0.01))),
        );
      } else {
        const holeRadius = PIN_RADIUS + RIVET_RUN_CLEARANCE;
        const hole = track(
          wasm.Manifold.cylinder(thickness - pocketH + 0.02, holeRadius, holeRadius, 32, false),
        );
        body = track(body.subtract(track(hole.translate(localX, 0, pocketH - 0.01))));
        const boreRadius = RIVET_CAP_RADIUS + RIVET_RUN_CLEARANCE;
        const bore = track(
          wasm.Manifold.cylinder(RIVET_BORE_DEPTH + 0.01, boreRadius, boreRadius, 32, false),
        );
        body = track(
          body.subtract(track(bore.translate(localX, 0, thickness - RIVET_BORE_DEPTH))),
        );
      }
    }

    if (singlePivot && index < params.units - 1) {
      const tailPivotX = pivotOffset + tailReach;
      const discA = track(pivotCircle.translate(pivotOffset, 0));
      const discB = track(pivotCircle.translate(tailPivotX, 0));
      const tailSection = track(wasm.CrossSection.hull([discA, discB]));
      let tail = track(wasm.Manifold.extrude(tailSection, tailT));
      tail = magnet ? addTailPocket(tail, tailPivotX, 0) : addRivet(tail, tailPivotX, 0);
      body = track(body.add(tail));
    }

    let number = labelSection(
      wasm,
      track,
      font,
      String(index + 1),
      numberSize,
      0,
      0,
      params.rotateNumbers,
    );
    for (const localX of receiving) {
      const jointDisc = track(
        wasm.CrossSection.circle(RIVET_CAP_RADIUS + RIVET_RUN_CLEARANCE + 1, 32),
      );
      number = track(number.subtract(track(jointDisc.translate(localX, 0))));
    }
    const accentSection = track(wasm.CrossSection.union([pillFrame, number]));
    const clipped = track(accentSection.intersect(pillOutline));

    const rowY = index * rowPitch;
    const suffix = `-${index + 1}`;
    const group = `link${suffix}`;
    if (clipped.toPolygons().length > 0) {
      const inlayCut = track(wasm.Manifold.extrude(clipped, INLAY_DEPTH + 0.01));
      const placedCut = track(inlayCut.translate(0, 0, thickness - INLAY_DEPTH));
      const cutBody = track(body.subtract(placedCut));
      parts.push({
        name: `link${suffix}`,
        solid: cutBody.translate(0, rowY, 0),
        accent: false,
        group,
      });
      const inlay = track(wasm.Manifold.extrude(clipped, INLAY_DEPTH));
      const placedInlay = track(inlay.translate(0, 0, thickness - INLAY_DEPTH));
      parts.push({
        name: `accent${suffix}`,
        solid: placedInlay.translate(0, rowY, 0),
        accent: true,
        group,
      });
    } else {
      parts.push({ name: `link${suffix}`, solid: body.translate(0, rowY, 0), accent: false, group });
    }
  }

  if (!singlePivot) {
    const strapSpan = pillGap + width;
    const discA = track(pivotCircle.translate(0, 0));
    const discB = track(pivotCircle.translate(strapSpan, 0));
    const strapSection = track(wasm.CrossSection.hull([discA, discB]));
    for (let index = 0; index + 1 < params.units; index++) {
      let strap = track(wasm.Manifold.extrude(strapSection, tailT));
      for (const x of [0, strapSpan]) {
        strap = magnet ? addTailPocket(strap, x, 0) : addRivet(strap, x, 0);
      }
      const rowY = (params.units + index) * rowPitch;
      parts.push({
        name: `strap-${index + 1}`,
        solid: strap.translate(0, rowY, 0),
        accent: false,
        group: `strap-${index + 1}`,
      });
    }
  }
  return parts;
}
