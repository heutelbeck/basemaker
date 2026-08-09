import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { makeNoise2d } from '../../params/noise.ts';
import type { BaseParams, PlaqueParams } from '../../params/types.ts';
import type { Track } from '../dispose.ts';
import type { Point2 } from '../../params/tessellation.ts';

/** Radial embedment into the wall so the plaque bonds over its full arc. */
export const PLAQUE_EMBED = 0.5;

/** Internal noise seed for the torn parchment edges; same tear per design. */
const TORN_SEED = 9173;

/** How far the plaque stands proud of the wall for side lettering, 0 without one. */
export function plaqueProud(params: BaseParams): number {
  return params.plaque === null ? 0 : params.plaque.thicknessMm;
}

/**
 * Arc-length frame over the footprint outline: position and outward
 * normal at any perimeter position, so plaques can be swept along the
 * side wall of any base shape, wrapping corners like a label.
 */
export interface OutlineFrame {
  perimeter: number;
  pointAt(s: number): Point2;
  normalAt(s: number): Point2;
  centerFor(directionRad: number): number;
}

export function outlineFrameOf(outline: Point2[]): OutlineFrame {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    area += x1 * y2 - x2 * y1;
  }
  const points = area < 0 ? [...outline].reverse() : outline;
  const count = points.length;
  const cumulative: number[] = [0];
  for (let i = 0; i < count; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % count];
    cumulative.push(cumulative[i] + Math.hypot(x2 - x1, y2 - y1));
  }
  const perimeter = cumulative[count];
  const locate = (s: number): { index: number; t: number } => {
    let wrapped = s % perimeter;
    if (wrapped < 0) {
      wrapped += perimeter;
    }
    for (let i = 0; i < count; i++) {
      if (wrapped <= cumulative[i + 1] || i === count - 1) {
        const length = cumulative[i + 1] - cumulative[i];
        return { index: i, t: length > 0 ? (wrapped - cumulative[i]) / length : 0 };
      }
    }
    return { index: count - 1, t: 1 };
  };
  const segmentNormal = (index: number): Point2 => {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % count];
    const length = Math.hypot(x2 - x1, y2 - y1);
    return length > 0 ? [(y2 - y1) / length, -(x2 - x1) / length] : [1, 0];
  };
  return {
    perimeter,
    pointAt: (s) => {
      const { index, t } = locate(s);
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % count];
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    },
    normalAt: (s) => segmentNormal(locate(s).index),
    centerFor: (directionRad) => {
      const dx = Math.cos(directionRad);
      const dy = Math.sin(directionRad);
      let bestScore = -Infinity;
      let bestS = 0;
      for (let i = 0; i < count; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % count];
        const [nx, ny] = segmentNormal(i);
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const score = midX * dx + midY * dy + 0.5 * (nx * dx + ny * dy);
        if (score > bestScore) {
          bestScore = score;
          bestS = (cumulative[i] + cumulative[i + 1]) / 2;
        }
      }
      return bestS;
    },
  };
}

/** Wall inset at height z under the linear edge-slope taper. */
export function wallInsetAt(params: BaseParams, z: number): number {
  return (params.edgeSlope * z) / params.height;
}

/** The wall's lean angle from vertical, in radians. */
export function wallSlopeRad(params: BaseParams): number {
  return Math.atan2(params.edgeSlope, params.height);
}

export interface SlabColumn {
  zTop: number;
  zBottom: number;
  proud: number;
}

/**
 * Shared cross-section description of a plaque slab swept along the
 * wall, consumed by both the mesh builder and the B-rep STEP builder.
 */
export interface PlaqueSlabSpec {
  frame: OutlineFrame;
  sStart: number;
  width: number;
  columns: number;
  at(u: number): SlabColumn;
}

function plaqueSpan(params: BaseParams, plaque: PlaqueParams): { z0: number; z1: number } {
  const shearDrop = plaque.thicknessMm * 0.4 * Math.sin(wallSlopeRad(params));
  const z0 = (params.height - plaque.heightMm) / 2 - shearDrop;
  return { z0, z1: z0 + plaque.heightMm };
}

export function plateSlabSpec(
  params: BaseParams,
  plaque: PlaqueParams,
  outline: Point2[],
): PlaqueSlabSpec {
  const frame = outlineFrameOf(outline);
  const { z0, z1 } = plaqueSpan(params, plaque);
  return {
    frame,
    sStart: frame.centerFor((plaque.angleDeg * Math.PI) / 180) - plaque.widthMm / 2,
    width: plaque.widthMm,
    columns: Math.max(24, Math.ceil(plaque.widthMm / 0.35)),
    at: () => ({ zTop: z1, zBottom: z0, proud: plaque.thicknessMm }),
  };
}

export function scrollRollRadiusFor(plaque: PlaqueParams): number {
  return Math.min(1.1, Math.max(0.45, plaque.heightMm * 0.2));
}

export function scrollSlabSpec(
  params: BaseParams,
  plaque: PlaqueParams,
  outline: Point2[],
): PlaqueSlabSpec {
  const frame = outlineFrameOf(outline);
  const { z0, z1 } = plaqueSpan(params, plaque);
  const rollRadius = scrollRollRadiusFor(plaque);
  const noise = makeNoise2d(TORN_SEED);
  const sheetHeight = z1 - z0;
  const tornDepth = Math.min(0.55, sheetHeight * 0.16);
  const sagDepth = sheetHeight * 0.14;
  const ripples = Math.max(2, Math.round(plaque.widthMm / 5));
  const minProud = Math.max(0.18, plaque.thicknessMm * 0.35);
  const tear = (arcPos: number, lane: number): number => {
    const fine = noise.fbm(arcPos * 2.1, lane, 3);
    const notches = Math.pow(noise.fbm(arcPos * 0.9 + 31, lane + 13, 2), 3);
    return tornDepth * (0.45 * fine + 1.1 * notches);
  };
  return {
    frame,
    sStart: frame.centerFor((plaque.angleDeg * Math.PI) / 180) - plaque.widthMm / 2,
    width: plaque.widthMm,
    columns: Math.max(28, Math.ceil(plaque.widthMm / 0.3)),
    at: (u) => {
      const core = u * plaque.widthMm;
      const edgeDistance = Math.min(core, plaque.widthMm - core);
      const fade = Math.min(1, Math.max(0, edgeDistance / (0.14 * plaque.widthMm)));
      const joinWeight = 1 - fade * fade * (3 - 2 * fade);
      const coreU = u;
      const rollOverhang = Math.min(0.15, z0 - 0.1);
      const sag = sagDepth * Math.sin(Math.PI * coreU) * (1 - joinWeight);
      const zTop =
        z1 + rollOverhang * joinWeight - (0.55 * sag + tear(core, 0.7)) * (1 - joinWeight);
      const zBottom =
        z0 - rollOverhang * joinWeight + (0.45 * sag + tear(core, 7.9)) * (1 - joinWeight);
      const ripple = 0.5 - 0.5 * Math.cos(2 * Math.PI * coreU * ripples);
      const wobble = 0.3 * (noise.fbm(core * 0.6, 21.4, 2) - 0.5);
      const lift = Math.min(1, Math.max(0, 0.15 + 0.85 * ripple + wobble));
      const waveProud = minProud + (plaque.thicknessMm - minProud) * lift;
      const joinProud = plaque.thicknessMm * 0.4 + rollRadius * 0.55;
      return {
        zTop,
        zBottom,
        proud: waveProud * (1 - joinWeight) + joinProud * joinWeight,
      };
    },
  };
}

/**
 * One corner of a slab column in world coordinates. The radial offset
 * runs along the leaned wall normal, so slab top and bottom faces tilt
 * with the wall instead of lying parallel to the ground.
 */
export function slabCorner(
  params: BaseParams,
  frame: OutlineFrame,
  s: number,
  z: number,
  offset: number,
): [number, number, number] {
  const [px, py] = frame.pointAt(s);
  const [nx, ny] = frame.normalAt(s);
  const slope = wallSlopeRad(params);
  const liftedZ = z + offset * Math.sin(slope);
  const shift = offset * Math.cos(slope) - wallInsetAt(params, liftedZ);
  return [px + nx * shift, py + ny * shift, liftedZ];
}

export interface RollPlacement {
  anchorX: number;
  anchorY: number;
  centerZ: number;
  azimuthRad: number;
  length: number;
  radius: number;
  knobRadius: number;
  knobTopCenter: number;
  knobBottomCenter: number;
}

export function scrollRolls(
  params: BaseParams,
  plaque: PlaqueParams,
  spec: PlaqueSlabSpec,
): RollPlacement[] {
  const { z0, z1 } = plaqueSpan(params, plaque);
  const radius = scrollRollRadiusFor(plaque);
  const overhang = Math.min(0.15, z0 - 0.1);
  const rollZ0 = z0 - overhang;
  const rollZ1 = z1 + overhang;
  const centerZ = (rollZ0 + rollZ1) / 2;
  const cosSlope = Math.cos(wallSlopeRad(params));
  const length = (rollZ1 - rollZ0) / cosSlope;
  const knobRadius = radius * 1.12;
  const topRoom = Math.max(0, (params.height - 0.05 - rollZ1) / cosSlope);
  const bottomRoom = Math.max(0, (rollZ0 - 0.05) / cosSlope);
  const centerS = spec.frame.centerFor((plaque.angleDeg * Math.PI) / 180);
  const axisOffset = plaque.thicknessMm * 0.4;
  return [centerS - plaque.widthMm / 2, centerS + plaque.widthMm / 2].map((s) => {
    const [anchorX, anchorY, anchorZ] = slabCorner(params, spec.frame, s, centerZ, axisOffset);
    const [nx, ny] = spec.frame.normalAt(s);
    const lift = anchorZ - centerZ;
    const liftedTopRoom = Math.max(0, topRoom - lift / cosSlope);
    const liftedBottomRoom = Math.max(0, bottomRoom + lift / cosSlope);
    return {
      anchorX,
      anchorY,
      centerZ: anchorZ,
      azimuthRad: Math.atan2(ny, nx),
      length,
      radius,
      knobRadius,
      knobTopCenter: length / 2 + Math.min(liftedTopRoom, knobRadius * 0.6) - knobRadius,
      knobBottomCenter: -(length / 2 + Math.min(liftedBottomRoom, knobRadius * 0.6) - knobRadius),
    };
  });
}

export interface RivetPlacement {
  startX: number;
  startY: number;
  startZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  radius: number;
  length: number;
}

export function plateRivets(
  params: BaseParams,
  plaque: PlaqueParams,
  spec: PlaqueSlabSpec,
): RivetPlacement[] {
  const { z0, z1 } = plaqueSpan(params, plaque);
  const buried = 0.5;
  const rivetRadius = Math.min(0.5, Math.max(0.25, plaque.heightMm * 0.11));
  const sInset = rivetRadius + 0.5;
  const zInset = rivetRadius + 0.4;
  const slope = wallSlopeRad(params);
  const cosSlope = Math.cos(slope);
  const sinSlope = Math.sin(slope);
  const placements: RivetPlacement[] = [];
  const offset = plaque.thicknessMm - buried;
  for (const s of [spec.sStart + sInset, spec.sStart + spec.width - sInset]) {
    for (const z of [z0 + zInset, z1 - zInset]) {
      const [startX, startY, startZ] = slabCorner(params, spec.frame, s, z, offset);
      const [nx, ny] = spec.frame.normalAt(s);
      placements.push({
        startX,
        startY,
        startZ,
        dirX: nx * cosSlope,
        dirY: ny * cosSlope,
        dirZ: sinSlope,
        radius: rivetRadius,
        length: buried + plaque.rivetHeightMm,
      });
    }
  }
  return placements;
}

/**
 * Watertight slab swept along the outline: four corners per column,
 * following the wall's taper, with per-column height and thickness.
 */
function sweptSlab(
  wasm: ManifoldToplevel,
  track: Track,
  params: BaseParams,
  spec: PlaqueSlabSpec,
): Manifold {
  const positions: number[] = [];
  for (let i = 0; i <= spec.columns; i++) {
    const u = i / spec.columns;
    const s = spec.sStart + spec.width * u;
    const { zTop, zBottom, proud } = spec.at(u);
    for (const [z, offset] of [
      [zBottom, proud],
      [zTop, proud],
      [zTop, -PLAQUE_EMBED],
      [zBottom, -PLAQUE_EMBED],
    ] as const) {
      positions.push(...slabCorner(params, spec.frame, s, z, offset));
    }
  }
  const triangles: number[] = [];
  for (let i = 0; i < spec.columns; i++) {
    const c0 = i * 4;
    const c1 = (i + 1) * 4;
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      triangles.push(c0 + edge, c1 + edge, c1 + next, c0 + edge, c1 + next, c0 + next);
    }
  }
  const start = 0;
  triangles.push(start, start + 1, start + 2, start, start + 2, start + 3);
  const end = spec.columns * 4;
  triangles.push(end, end + 2, end + 1, end, end + 3, end + 2);
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(positions),
    triVerts: new Uint32Array(triangles),
  });
  mesh.merge();
  return track(wasm.Manifold.ofMesh(mesh));
}

function rivetMesh(
  wasm: ManifoldToplevel,
  track: Track,
  params: BaseParams,
  placement: RivetPlacement,
): Manifold {
  const stud = track(
    wasm.Manifold.cylinder(placement.length, placement.radius, placement.radius, 24, false),
  );
  const lying = track(stud.rotate(0, 90, 0));
  const slopeDeg = (wallSlopeRad(params) * 180) / Math.PI;
  const leaned = track(lying.rotate(0, -slopeDeg, 0));
  const azimuth = (Math.atan2(placement.dirY, placement.dirX) * 180) / Math.PI;
  const spun = track(leaned.rotate(0, 0, azimuth));
  return track(spun.translate(placement.startX, placement.startY, placement.startZ));
}

function rollMesh(
  wasm: ManifoldToplevel,
  track: Track,
  params: BaseParams,
  placement: RollPlacement,
): Manifold {
  const shaft = track(
    wasm.Manifold.cylinder(placement.length, placement.radius, placement.radius, 32, true),
  );
  const knob = (zLocal: number): Manifold => {
    const sphere = track(wasm.Manifold.sphere(placement.knobRadius, 32));
    return track(sphere.translate(0, 0, zLocal));
  };
  const grouped = track(
    wasm.Manifold.union([
      shaft,
      knob(placement.knobTopCenter),
      knob(placement.knobBottomCenter),
    ]),
  );
  const slopeDeg = (wallSlopeRad(params) * 180) / Math.PI;
  const leaned = track(grouped.rotate(0, -slopeDeg, 0));
  const spun = track(leaned.rotate(0, 0, (placement.azimuthRad * 180) / Math.PI));
  return track(spun.translate(placement.anchorX, placement.anchorY, placement.centerZ));
}

/**
 * The plaque solid on the side wall of any base shape: either a riveted
 * steel plate or an ornate parchment scroll opening left to right - a
 * torn-edged sheet strung between two rolls with rounded end caps. The
 * plaque is swept along the footprint outline (wrapping corners like a
 * label), centered on the side facing `angleDeg`, and embeds 0.5 mm into
 * the wall for a robust union. Side lettering at the same angle on round
 * bases lands on the plaque face.
 */
export function plaqueSolid(
  wasm: ManifoldToplevel,
  track: Track,
  params: BaseParams,
  bottomOutline: Point2[],
): Manifold {
  const plaque = params.plaque;
  if (plaque === null) {
    throw new Error('The plaque solid requires plaque parameters.');
  }
  let solid: Manifold;
  if (plaque.style === 'plate') {
    const spec = plateSlabSpec(params, plaque, bottomOutline);
    const body = sweptSlab(wasm, track, params, spec);
    const studs = plateRivets(params, plaque, spec).map((placement) =>
      rivetMesh(wasm, track, params, placement),
    );
    solid = track(wasm.Manifold.union([body, ...studs]));
  } else {
    const spec = scrollSlabSpec(params, plaque, bottomOutline);
    const sheet = sweptSlab(wasm, track, params, spec);
    const rolls = scrollRolls(params, plaque, spec).map((placement) =>
      rollMesh(wasm, track, params, placement),
    );
    solid = track(wasm.Manifold.union([sheet, ...rolls]));
  }
  return track(solid.intersect(heightBand(wasm, track, params)));
}

/**
 * Clamp region between the base's bottom and top faces. Tight plaque
 * fits can shear a corner past the top face, which would make a print
 * lying on its top face float; the intersection guarantees flushness.
 */
function heightBand(wasm: ManifoldToplevel, track: Track, params: BaseParams): Manifold {
  const span = 4000;
  const proto = track(wasm.Manifold.cube([span, span, params.height - 0.02], false));
  return track(proto.translate(-span / 2, -span / 2, 0.02));
}
