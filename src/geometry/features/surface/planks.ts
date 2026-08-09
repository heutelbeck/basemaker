import type { ManifoldToplevel } from 'manifold-3d';
import { makeNoise2d, makeWarpField } from '../../../params/noise.ts';
import { range, seededRng } from '../../../params/random.ts';
import type { SurfaceParams } from '../../../params/surface.ts';
import type { Track } from '../../dispose.ts';
import { heightfieldBlock } from '../../heightfield.ts';
import type { SurfaceRelief, TopFace } from './shared.ts';
import { EMBED, faceClip } from './shared.ts';

/**
 * Board-walk planks as one continuous heightfield. Every board carries
 * cathedral ring grain (contours of an off-board pith), fine stretched
 * fiber noise, cross-board cupping, beveled edges, and knots that bend the
 * rings around a slightly sunken core. Board edges and ends run through a
 * warp field, so seams are worn and jagged instead of die-cut.
 */
export function buildPlanks(
  wasm: ManifoldToplevel,
  track: Track,
  surface: Extract<SurfaceParams, { type: 'planks' }>,
  face: TopFace,
  height: number,
): SurfaceRelief {
  const angle = (surface.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.hypot(face.hx, face.hy) + surface.plankWidth;
  const pitch = surface.plankWidth + surface.gap;
  const warp = makeWarpField(surface.seed * 13 + 1, 0.35, 4.5);
  const fiber = makeNoise2d(surface.seed * 17 + 5);

  interface Segment {
    start: number;
    end: number;
    heightScale: number;
    pithX: number;
    pithY: number;
    ringSpacing: number;
    knot: { x: number; y: number; spacing: number } | null;
  }
  const rows = new Map<number, Segment[]>();
  const rowSegments = (row: number): Segment[] => {
    let segments = rows.get(row);
    if (segments !== undefined) {
      return segments;
    }
    const rowRng = seededRng(surface.seed * 101 + row * 37 + 1000003);
    segments = [];
    let start = -reach - range(rowRng, 0, 10);
    while (start < reach) {
      const end = start + range(rowRng, 16, 45);
      const rowCenter = row * pitch + surface.plankWidth / 2;
      const segment: Segment = {
        start,
        end,
        heightScale: range(rowRng, 0.88, 1.1),
        pithX: range(rowRng, start - 10, end + 10),
        pithY: rowCenter + surface.plankWidth * range(rowRng, 1.2, 3) * (rowRng() < 0.5 ? -1 : 1),
        ringSpacing: range(rowRng, 0.9, 1.7),
        knot:
          rowRng() < 0.28 && end - start > 12
            ? {
                x: range(rowRng, start + 4, end - 4),
                y: rowCenter + surface.plankWidth * range(rowRng, -0.28, 0.28),
                spacing: range(rowRng, 0.35, 0.55),
              }
            : null,
      };
      segments.push(segment);
      start = end + surface.gap;
    }
    rows.set(row, segments);
    return segments;
  };

  const grainAmp = surface.grain ? surface.reliefHeight * 0.22 : 0;
  const fiberAmp = surface.grain ? surface.reliefHeight * 0.09 : 0;
  const heightAt = (x: number, y: number): number => {
    const rawLx = x * cos + y * sin;
    const rawLy = -x * sin + y * cos;
    const [lx, ly] = warp.displace(rawLx, rawLy);
    const row = Math.floor(ly / pitch);
    const v = ly - row * pitch;
    if (v > surface.plankWidth) {
      return EMBED;
    }
    const segments = rowSegments(row);
    const segment = segments.find((sgm) => lx >= sgm.start && lx <= sgm.end);
    if (segment === undefined) {
      return EMBED;
    }
    const edgeDistance = Math.min(v, surface.plankWidth - v, lx - segment.start, segment.end - lx);
    if (edgeDistance <= 0) {
      return EMBED;
    }
    const base = surface.reliefHeight * segment.heightScale;
    const across = (2 * v) / surface.plankWidth - 1;
    const cupping = -0.14 * surface.reliefHeight * across * across;
    let rings = 0;
    if (grainAmp > 0) {
      const dxp = lx - segment.pithX;
      const dyp = ly - segment.pithY;
      const pithDistance = Math.sqrt(dxp * dxp * 0.07 + dyp * dyp);
      let phase = (2 * Math.PI * pithDistance) / segment.ringSpacing;
      let knotDip = 0;
      if (segment.knot !== null) {
        const kd = Math.hypot(lx - segment.knot.x, ly - segment.knot.y);
        const influence = Math.exp(-(kd * kd) / (2.2 * 2.2));
        const knotPhase = (2 * Math.PI * kd) / segment.knot.spacing;
        phase = phase * (1 - influence) + knotPhase * influence;
        knotDip = -0.1 * surface.reliefHeight * Math.exp(-(kd * kd) / (0.55 * 0.55));
      }
      const ridge = 0.5 * (1 + Math.sin(phase));
      const ridgeSharpness = Math.pow(ridge, 1.6);
      const variation = 0.55 + 0.45 * fiber.fbm(lx * 0.12, ly * 0.5, 2);
      rings = grainAmp * ridgeSharpness * variation + knotDip;
    }
    const fibers = fiberAmp * (fiber.fbm(lx * 0.7, ly * 5.5, 3) - 0.5);
    const bevelT = Math.min(edgeDistance / 0.55, 1);
    const bevel = Math.sqrt(bevelT * (2 - bevelT));
    const relief = Math.max(0.04, base + cupping + rings + fibers);
    return EMBED + relief * bevel;
  };

  const half = Math.max(face.hx, face.hy) + 1;
  const gridCells = Math.min(360, Math.max(120, Math.ceil((2 * half) / 0.16)));
  const block = heightfieldBlock(wasm, track, half, heightAt, gridCells);
  const placed = track(block.translate(0, 0, height - EMBED));
  const clipRegion = faceClip(wasm, track, face);
  const clipPrismProto = track(
    wasm.Manifold.extrude(clipRegion, surface.reliefHeight * 2 + EMBED + 1),
  );
  const clipPrism = track(clipPrismProto.translate(0, 0, height - EMBED));
  return { add: track(placed.intersect(clipPrism)), cut: null };
}
