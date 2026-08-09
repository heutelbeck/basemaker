import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { range, seededRng } from '../../../params/random.ts';
import type { SurfaceParams } from '../../../params/surface.ts';
import type { Point2 } from '../../../params/tessellation.ts';
import type { Track } from '../../dispose.ts';
import type { SurfaceRelief, TopFace } from './shared.ts';
import { clipSection, raiseSection } from './shared.ts';

/**
 * Industrial deck plating: staggered panels with weld seams, and rivet
 * rows, anti-slip tread bars, or real-world almond checker bumps at a
 * configurable raise above the plate.
 */
export function buildSteelPlates(
  wasm: ManifoldToplevel,
  track: Track,
  surface: Extract<SurfaceParams, { type: 'steelPlates' }>,
  face: TopFace,
  height: number,
): SurfaceRelief {
  const rng = seededRng(surface.seed);
  const pitch = surface.plateSize + surface.gap;
  const plates: Point2[][] = [];
  const details: Point2[][] = [];
  let row = 0;
  for (let y = -face.hy - pitch; y < face.hy + pitch; y += pitch) {
    const shift = (row % 2) * surface.plateSize * range(rng, 0.35, 0.55);
    for (let x = -face.hx - pitch - shift; x < face.hx + pitch; x += pitch) {
      const w = surface.plateSize * range(rng, 0.9, 1.25);
      plates.push([
        [x, y],
        [x + w, y],
        [x + w, y + surface.plateSize],
        [x, y + surface.plateSize],
      ]);
      if (surface.detail === 'rivets') {
        const inset = 1.2;
        const rivetPitch = 2.8;
        const edges: [Point2, Point2][] = [
          [
            [x + inset, y + inset],
            [x + w - inset, y + inset],
          ],
          [
            [x + w - inset, y + surface.plateSize - inset],
            [x + inset, y + surface.plateSize - inset],
          ],
        ];
        for (const [a, b] of edges) {
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const count = Math.max(2, Math.floor(length / rivetPitch));
          for (let i = 0; i <= count; i++) {
            const t = i / count;
            details.push(octagon(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.55));
          }
        }
      } else if (surface.detail === 'tread' || surface.detail === 'diamond') {
        const treadPitch = 3.4;
        const margin = 1.6;
        const rowCount = Math.max(1, Math.floor((surface.plateSize - 2 * margin) / (treadPitch / 2)) + 1);
        const rowStart = y + (surface.plateSize - (rowCount - 1) * (treadPitch / 2)) / 2;
        for (let treadRow = 0; treadRow < rowCount; treadRow++) {
          const ty = rowStart + treadRow * (treadPitch / 2);
          const treadShift = (treadRow % 2) * (treadPitch / 2);
          const usable = w - 2 * margin - treadShift;
          const colCount = Math.max(1, Math.floor(usable / treadPitch) + 1);
          const colStart = x + treadShift + (w - treadShift - (colCount - 1) * treadPitch) / 2;
          for (let col = 0; col < colCount; col++) {
            const tx = colStart + col * treadPitch;
            const dir = treadRow % 2 === 0 ? 1 : -1;
            const shape =
              surface.detail === 'diamond'
                ? lens(tx, ty, 2.4, 0.9, (dir * Math.PI) / 4)
                : treadBar(tx, ty, 2.1, 0.7, (dir * Math.PI) / 4);
            details.push(shape);
          }
        }
      }
      x += w - surface.plateSize;
    }
    row++;
  }
  const plateSection = track(wasm.CrossSection.ofPolygons(plates, 'Positive'));
  const solids: Manifold[] = [];
  const raisedPlates = raiseSection(
    wasm,
    track,
    clipSection(wasm, track, plateSection, face),
    surface.reliefHeight,
    height,
  );
  if (raisedPlates !== null) {
    solids.push(raisedPlates);
  }
  if (details.length > 0) {
    const detailSection = track(wasm.CrossSection.ofPolygons(details, 'Positive'));
    const clippedDetails = track(detailSection.intersect(plateSection));
    const raisedDetails = raiseSection(
      wasm,
      track,
      clipSection(wasm, track, clippedDetails, face),
      surface.reliefHeight + surface.detailHeight,
      height,
    );
    if (raisedDetails !== null) {
      solids.push(raisedDetails);
    }
  }
  if (solids.length === 0) {
    return { add: null, cut: null };
  }
  return { add: track(wasm.Manifold.union(solids)), cut: null };
}

function octagon(cx: number, cy: number, radius: number): Point2[] {
  const points: Point2[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i + Math.PI / 8;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

/** Pointed almond shape of real checker plate bumps. */
function lens(cx: number, cy: number, length: number, width: number, angle: number): Point2[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points: Point2[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const x = (length / 2) * Math.cos(t);
    const y = (width / 2) * Math.sin(t) * (1 - Math.abs(Math.cos(t)) * 0.35);
    points.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
  }
  return points;
}

function treadBar(cx: number, cy: number, length: number, width: number, angle: number): Point2[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hl = length / 2;
  const hw = width / 2;
  const corners: Point2[] = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ];
  return corners.map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
}
