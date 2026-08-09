import type { ManifoldToplevel } from 'manifold-3d';
import { makeNoise2d, makeWarpField } from '../../../params/noise.ts';
import { distanceToBoundary, pointInPolygon } from '../../../params/polygon.ts';
import type { Rng } from '../../../params/random.ts';
import { range, seededRng } from '../../../params/random.ts';
import type { SurfaceParams } from '../../../params/surface.ts';
import type { Point2 } from '../../../params/tessellation.ts';
import { lloydRelax, voronoiCells } from '../../../params/voronoi.ts';
import type { Track } from '../../dispose.ts';
import { heightfieldBlock } from '../../heightfield.ts';
import type { SurfaceRelief, TopFace } from './shared.ts';
import { EMBED, faceClip } from './shared.ts';

/**
 * Cobblestones as one continuous pillow heightfield. The joint network
 * comes from real laying patterns (Lloyd-relaxed Voronoi field stone,
 * running-bond courses, peacock fans); each sample point is warped through
 * a smooth noise field, located in its stone, and raised by a circular
 * fillet profile of its distance to the joint. Every stone gets its own
 * height and tilt, so the result is a smooth, high resolution paved
 * surface rather than extruded polygons - the slicer handles the layers.
 */
export function buildCobblestones(
  wasm: ManifoldToplevel,
  track: Track,
  surface: Extract<SurfaceParams, { type: 'cobblestone' }>,
  face: TopFace,
  height: number,
  tolMm: number,
): SurfaceRelief {
  void tolMm;
  const rng = seededRng(surface.seed);
  const warp = makeWarpField(surface.seed, surface.stoneSize * 0.13, surface.stoneSize * 1.9);
  const granite = makeNoise2d(surface.seed * 53 + 29);
  const stoneField =
    surface.pattern === 'fan'
      ? fanStoneField(surface, rng)
      : polygonStoneField(surface, face, rng);
  if (stoneField === null) {
    return { add: null, cut: null };
  }
  const bevel = surface.domed
    ? surface.stoneSize * 0.38
    : Math.max(surface.stoneSize * 0.12, 0.35);
  const heightAt = (x: number, y: number): number => {
    const [qx, qy] = warp.displace(x, y);
    const sample = stoneField(qx, qy);
    if (sample === null || sample.jointDistance <= 0) {
      return EMBED;
    }
    const t = Math.min(sample.jointDistance / bevel, 1);
    const pillow = Math.sqrt(t * (2 - t));
    const grain =
      0.045 * surface.reliefHeight * (granite.fbm(qx * 1.8, qy * 1.8, 3) - 0.5) +
      0.02 * surface.reliefHeight * (granite.fbm(qx * 5.2 + 17, qy * 5.2, 2) - 0.5);
    return EMBED + Math.max(0, pillow * Math.max(sample.top + grain, 0.05));
  };

  const half = Math.max(face.hx, face.hy) + 1;
  const gridCells = Math.min(420, Math.max(140, Math.ceil((2 * half) / 0.12)));
  const block = heightfieldBlock(wasm, track, half, heightAt, gridCells);
  const placed = track(block.translate(0, 0, height - EMBED));
  const clipRegion = faceClip(wasm, track, face);
  const clipPrismProto = track(
    wasm.Manifold.extrude(clipRegion, surface.reliefHeight * 1.4 + EMBED + 1),
  );
  const clipPrism = track(clipPrismProto.translate(0, 0, height - EMBED));
  return { add: track(placed.intersect(clipPrism)), cut: null };
}

interface StoneSample {
  jointDistance: number;
  top: number;
}

type StoneField = (qx: number, qy: number) => StoneSample | null;

/** Deterministic integer hash to a value in [0, 1). */
function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Stone lookup over explicit joint-centerline polygons (Voronoi field
 * stone or running-bond courses), bucket-hashed for constant-time access.
 */
function polygonStoneField(
  surface: Extract<SurfaceParams, { type: 'cobblestone' }>,
  face: TopFace,
  rng: Rng,
): StoneField | null {
  const cells = cobbleCells(surface, face, rng);
  if (cells.length === 0) {
    return null;
  }
  interface StoneMeta {
    cell: Point2[];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    heightScale: number;
    tiltX: number;
    tiltY: number;
    cx: number;
    cy: number;
  }
  const stones: StoneMeta[] = cells.map((cell) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of cell) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      cx += x;
      cy += y;
    }
    return {
      cell,
      minX,
      maxX,
      minY,
      maxY,
      heightScale: range(rng, 0.85, 1.15),
      tiltX: range(rng, -0.045, 0.045),
      tiltY: range(rng, -0.045, 0.045),
      cx: cx / cell.length,
      cy: cy / cell.length,
    };
  });
  const bucketSize = surface.stoneSize + surface.gap;
  const buckets = new Map<string, StoneMeta[]>();
  const bucketKey = (bx: number, by: number) => `${bx},${by}`;
  for (const stone of stones) {
    for (let bx = Math.floor(stone.minX / bucketSize); bx <= Math.floor(stone.maxX / bucketSize); bx++) {
      for (let by = Math.floor(stone.minY / bucketSize); by <= Math.floor(stone.maxY / bucketSize); by++) {
        const key = bucketKey(bx, by);
        const list = buckets.get(key);
        if (list === undefined) {
          buckets.set(key, [stone]);
        } else {
          list.push(stone);
        }
      }
    }
  }
  return (qx, qy) => {
    const candidates = buckets.get(bucketKey(Math.floor(qx / bucketSize), Math.floor(qy / bucketSize)));
    if (candidates === undefined) {
      return null;
    }
    for (const stone of candidates) {
      if (qx < stone.minX || qx > stone.maxX || qy < stone.minY || qy > stone.maxY) {
        continue;
      }
      if (!pointInPolygon(stone.cell, qx, qy)) {
        continue;
      }
      const jointDistance = distanceToBoundary(stone.cell, qx, qy) - surface.gap / 2;
      const top =
        surface.reliefHeight * stone.heightScale +
        stone.tiltX * (qx - stone.cx) +
        stone.tiltY * (qy - stone.cy);
      return { jointDistance, top };
    }
    return null;
  };
}

/**
 * Analytic peacock-fan field. Fans are overlapping scales on a staggered
 * grid, laid front row first: every point belongs to the front-most fan
 * whose scale disc covers it, so the seams between fans are the clean
 * circular arcs of the front fans - exactly how laid fan pavement meets -
 * instead of clipped sliver stones. Stones are addressed by
 * (fan, ring, sector) with a round keystone at each fan focus.
 */
function fanStoneField(
  surface: Extract<SurfaceParams, { type: 'cobblestone' }>,
  rng: Rng,
): StoneField {
  const pitch = surface.stoneSize + surface.gap;
  const keystoneRadius = surface.stoneSize * 0.9 + surface.gap / 2;
  const ringsPerFan = 4;
  const scaleRadius = keystoneRadius + ringsPerFan * pitch;
  const columnSpacing = scaleRadius * 1.3;
  const rowSpacing = scaleRadius * 0.72;
  const phaseSeed = Math.floor(rng() * 1_000_000) + 11;
  const rowOffset = (j: number): number => (((j % 2) + 2) % 2 === 1 ? columnSpacing / 2 : 0);
  return (qx, qy) => {
    const jMin = Math.floor((qy - scaleRadius) / rowSpacing);
    const jMax = Math.ceil((qy + scaleRadius) / rowSpacing);
    let winI = 0;
    let winJ = 0;
    let winCx = 0;
    let winCy = 0;
    let winD = Infinity;
    let found = false;
    for (let j = jMin; j <= jMax; j++) {
      const off = rowOffset(j);
      const iMin = Math.floor((qx - off - scaleRadius) / columnSpacing);
      const iMax = Math.ceil((qx - off + scaleRadius) / columnSpacing);
      for (let i = iMin; i <= iMax; i++) {
        const cx = i * columnSpacing + off;
        const cy = j * rowSpacing;
        const d = Math.hypot(qx - cx, qy - cy);
        if (d >= scaleRadius) {
          continue;
        }
        if (!found || j < winJ || (j === winJ && d < winD)) {
          found = true;
          winI = i;
          winJ = j;
          winCx = cx;
          winCy = cy;
          winD = d;
        }
      }
    }
    if (!found) {
      return null;
    }
    let seam = Infinity;
    for (let j = jMin; j <= winJ; j++) {
      const off = rowOffset(j);
      const iMin = Math.floor((qx - off - 2 * scaleRadius) / columnSpacing);
      const iMax = Math.ceil((qx - off + 2 * scaleRadius) / columnSpacing);
      for (let i = iMin; i <= iMax; i++) {
        if (i === winI && j === winJ) {
          continue;
        }
        const d = Math.hypot(qx - (i * columnSpacing + off), qy - j * rowSpacing);
        seam = j < winJ ? Math.min(seam, d - scaleRadius) : Math.min(seam, (d - winD) / 2);
      }
    }
    const r = winD;
    let own: number;
    let ringIndex: number;
    let sector = 0;
    let stoneX = winCx;
    let stoneY = winCy;
    if (r < keystoneRadius) {
      own = keystoneRadius - r;
      ringIndex = -1;
    } else {
      const ring = Math.min(ringsPerFan - 1, Math.floor((r - keystoneRadius) / pitch));
      const inner = keystoneRadius + ring * pitch;
      const outer = inner + pitch;
      const mid = (inner + outer) / 2;
      const count = Math.max(6, Math.round((2 * Math.PI * mid) / pitch));
      const phase = hash01(winI, winJ, ring + phaseSeed) * 2 * Math.PI;
      const theta = Math.atan2(qy - winCy, qx - winCx);
      const sectorWidth = (2 * Math.PI) / count;
      const rel = (((theta - phase) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      sector = Math.min(count - 1, Math.floor(rel / sectorWidth));
      const angular = Math.min(rel - sector * sectorWidth, (sector + 1) * sectorWidth - rel) * r;
      own = Math.min(r - inner, outer - r, angular);
      const thetaMid = phase + (sector + 0.5) * sectorWidth;
      stoneX = winCx + mid * Math.cos(thetaMid);
      stoneY = winCy + mid * Math.sin(thetaMid);
      ringIndex = ring;
    }
    const jointDistance = Math.min(own, seam) - surface.gap / 2;
    const stoneA = winI * 73 + ringIndex * 7;
    const stoneB = winJ * 41 + sector * 5;
    const heightScale = 0.86 + 0.28 * hash01(stoneA, stoneB, phaseSeed);
    const tiltX = 0.09 * (hash01(stoneA + 3, stoneB, phaseSeed) - 0.5);
    const tiltY = 0.09 * (hash01(stoneA, stoneB + 9, phaseSeed) - 0.5);
    return {
      jointDistance,
      top:
        surface.reliefHeight * heightScale + tiltX * (qx - stoneX) + tiltY * (qy - stoneY),
    };
  };
}

function cobbleCells(
  surface: Extract<SurfaceParams, { type: 'cobblestone' }>,
  face: TopFace,
  rng: Rng,
): Point2[][] {
  const pitch = surface.stoneSize + surface.gap;
  const hx = face.hx + pitch;
  const hy = face.hy + pitch;
  if (surface.pattern === 'random') {
    let sites: Point2[] = [];
    for (let y = -hy; y <= hy; y += pitch) {
      for (let x = -hx; x <= hx; x += pitch) {
        sites.push([x + range(rng, -0.35, 0.35) * pitch, y + range(rng, -0.35, 0.35) * pitch]);
      }
    }
    sites = lloydRelax(sites, hx, hy, pitch * 3);
    return voronoiCells(sites, hx, hy, pitch * 3);
  }
  const cells: Point2[][] = [];
  for (let y = -hy; y < hy; y += surface.stoneSize + surface.gap) {
    let x = -hx - range(rng, 0, surface.stoneSize);
    while (x < hx) {
      const width = surface.stoneSize * range(rng, 0.8, 1.35);
      cells.push([
        [x, y],
        [x + width, y],
        [x + width, y + surface.stoneSize],
        [x, y + surface.stoneSize],
      ]);
      x += width + surface.gap;
    }
  }
  return cells;
}
