import type { ManifoldToplevel } from 'manifold-3d';
import { makeNoise2d, makeWarpField } from '../../../params/noise.ts';
import { range, seededRng } from '../../../params/random.ts';
import type { SurfaceParams } from '../../../params/surface.ts';
import type { Point2 } from '../../../params/tessellation.ts';
import type { Track } from '../../dispose.ts';
import { heightfieldBlock } from '../../heightfield.ts';
import type { SurfaceRelief, TopFace } from './shared.ts';
import { EMBED, faceClip } from './shared.ts';

/**
 * Lava field as one heightfield: cooled plates carry ropey pahoehoe
 * wrinkles and ridge noise, separated by wandering cracks with rounded
 * shoulders whose width breathes along the path. The whole field is a
 * raised layer, so the glowing crack floors sit at the original face.
 */
export function buildLava(
  wasm: ManifoldToplevel,
  track: Track,
  surface: Extract<SurfaceParams, { type: 'lava' }>,
  face: TopFace,
  height: number,
): SurfaceRelief {
  const rng = seededRng(surface.seed);
  const warp = makeWarpField(surface.seed * 3 + 5, surface.cellSize * 0.16, surface.cellSize * 1.4);
  const detail = makeNoise2d(surface.seed * 11 + 3);
  const pitch = surface.cellSize;
  const cols = Math.ceil((2 * face.hx) / pitch) + 2;
  const rows = Math.ceil((2 * face.hy) / pitch) + 2;
  const nodes: Point2[][] = [];
  for (let row = 0; row < rows; row++) {
    const rowPoints: Point2[] = [];
    for (let col = 0; col < cols; col++) {
      rowPoints.push([
        -face.hx + (col - 0.5) * pitch + range(rng, -0.3, 0.3) * pitch,
        -face.hy + (row - 0.5) * pitch + range(rng, -0.3, 0.3) * pitch,
      ]);
    }
    nodes.push(rowPoints);
  }

  interface CrackSegment {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    half: number;
  }
  const segments: CrackSegment[] = [];
  const addCrack = (a: Point2, b: Point2) => {
    if (rng() < 0.1) {
      return;
    }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(3, Math.ceil(length / 1.1));
    let previous = warp.displace(a[0], a[1]);
    for (let sIdx = 1; sIdx <= steps; sIdx++) {
      const t = sIdx / steps;
      const current = warp.displace(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      const midX = (previous[0] + current[0]) / 2;
      const midY = (previous[1] + current[1]) / 2;
      const breathing =
        0.55 + 0.9 * detail.fbm(midX / (pitch * 0.6), midY / (pitch * 0.6), 2);
      segments.push({
        ax: previous[0],
        ay: previous[1],
        bx: current[0],
        by: current[1],
        half: (surface.crackWidth / 2) * breathing,
      });
      previous = current;
    }
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (col + 1 < cols) {
        addCrack(nodes[row][col], nodes[row][col + 1]);
      }
      if (row + 1 < rows) {
        addCrack(nodes[row][col], nodes[row + 1][col]);
      }
    }
  }
  const bucketSize = pitch;
  const buckets = new Map<string, CrackSegment[]>();
  for (const segment of segments) {
    const minBx = Math.floor((Math.min(segment.ax, segment.bx) - 2) / bucketSize);
    const maxBx = Math.floor((Math.max(segment.ax, segment.bx) + 2) / bucketSize);
    const minBy = Math.floor((Math.min(segment.ay, segment.by) - 2) / bucketSize);
    const maxBy = Math.floor((Math.max(segment.ay, segment.by) + 2) / bucketSize);
    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        const key = `${bx},${by}`;
        const list = buckets.get(key);
        if (list === undefined) {
          buckets.set(key, [segment]);
        } else {
          list.push(segment);
        }
      }
    }
  }
  const crackClearance = (x: number, y: number): number => {
    let best = Infinity;
    const bx = Math.floor(x / bucketSize);
    const by = Math.floor(y / bucketSize);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const list = buckets.get(`${bx + ox},${by + oy}`);
        if (list === undefined) {
          continue;
        }
        for (const segment of list) {
          const dx = segment.bx - segment.ax;
          const dy = segment.by - segment.ay;
          const lengthSq = dx * dx + dy * dy;
          const t =
            lengthSq === 0
              ? 0
              : Math.min(Math.max(((x - segment.ax) * dx + (y - segment.ay) * dy) / lengthSq, 0), 1);
          const distance =
            Math.hypot(x - (segment.ax + t * dx), y - (segment.ay + t * dy)) - segment.half;
          best = Math.min(best, distance);
        }
      }
    }
    return best;
  };

  const plateHeight = surface.depth;
  const shoulder = Math.max(surface.crackWidth * 0.8, 0.5);
  const heightAt = (x: number, y: number): number => {
    const clearance = crackClearance(x, y);
    if (clearance <= 0) {
      return EMBED;
    }
    const ropes =
      0.3 * plateHeight * detail.ridged(x / (pitch * 0.45), y / (pitch * 0.45), 3) +
      0.16 * plateHeight * Math.sin(8 * detail.fbm(x / (pitch * 1.3), y / (pitch * 1.3), 2) * Math.PI);
    const t = Math.min(clearance / shoulder, 1);
    const lip = Math.sqrt(t * (2 - t));
    return EMBED + Math.max(0.05, plateHeight * 0.85 + ropes) * lip;
  };

  const half = Math.max(face.hx, face.hy) + 1;
  const gridCells = Math.min(360, Math.max(120, Math.ceil((2 * half) / 0.16)));
  const block = heightfieldBlock(wasm, track, half, heightAt, gridCells);
  const placed = track(block.translate(0, 0, height - EMBED));
  const clipRegion = faceClip(wasm, track, face);
  const clipPrismProto = track(
    wasm.Manifold.extrude(clipRegion, plateHeight * 2 + EMBED + 1),
  );
  const clipPrism = track(clipPrismProto.translate(0, 0, height - EMBED));
  return { add: track(placed.intersect(clipPrism)), cut: null };
}
