import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { isConvex } from '../../../params/polygon.ts';
import type { Point2 } from '../../../params/tessellation.ts';
import type { Track } from '../../dispose.ts';

/** Relief keeps this margin to the top-face edge so nothing overhangs. */
export const EDGE_MARGIN = 0.4;
/** Raised features sink this far into the top face for a robust union. */
export const EMBED = 0.2;

export interface SurfaceRelief {
  add: Manifold | null;
  cut: Manifold | null;
}

export interface TopFace {
  outline: Point2[];
  hx: number;
  hy: number;
  convex: boolean;
}

export function topFaceOf(outline: Point2[]): TopFace {
  const xs = outline.map(([x]) => Math.abs(x));
  const ys = outline.map(([, y]) => Math.abs(y));
  return {
    outline,
    hx: Math.max(...xs),
    hy: Math.max(...ys),
    convex: isConvex(outline),
  };
}

export function faceClip(wasm: ManifoldToplevel, track: Track, face: TopFace): CrossSection {
  const clip = track(wasm.CrossSection.ofPolygons([face.outline]));
  return track(clip.offset(-EDGE_MARGIN, 'Miter', 2));
}

export function clipSection(
  wasm: ManifoldToplevel,
  track: Track,
  section: CrossSection,
  face: TopFace,
): CrossSection | null {
  const clipped = track(section.intersect(faceClip(wasm, track, face)));
  return clipped.toPolygons().length === 0 ? null : clipped;
}

export function raiseSection(
  wasm: ManifoldToplevel,
  track: Track,
  section: CrossSection | null,
  reliefHeight: number,
  height: number,
): Manifold | null {
  if (section === null) {
    return null;
  }
  const prism = track(wasm.Manifold.extrude(section, reliefHeight + EMBED));
  return track(prism.translate(0, 0, height - EMBED));
}
