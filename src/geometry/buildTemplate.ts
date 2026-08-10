import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { TemplateParams } from '../params/template.ts';
import { circleOutline } from '../params/tessellation.ts';
import { withGeometryScope } from './dispose.ts';
import type { Track } from './dispose.ts';

const ERROR_INVALID_TEMPLATE = 'The generated template is not a valid manifold: ';

/** Flush accent frame inlay depth and width. */
const INLAY_DEPTH = 0.6;
const FRAME_WIDTH = 1.8;

export interface TemplatePart {
  name: string;
  solid: Manifold;
  accent: boolean;
}

function templateOutline(
  wasm: ManifoldToplevel,
  track: Track,
  params: TemplateParams,
): CrossSection {
  const tol = params.quality.chordTolMm;
  if (params.variant === 'round') {
    return track(wasm.CrossSection.ofPolygons([circleOutline(params.diameterMm / 2, tol)]));
  }
  const tipRadius = params.tipMm / 2;
  const headRadius = params.widthMm / 2;
  const tip = track(wasm.CrossSection.ofPolygons([circleOutline(tipRadius, tol)]));
  const head = track(wasm.CrossSection.ofPolygons([circleOutline(headRadius, tol)]));
  const placedHead = track(head.translate(params.lengthMm - tipRadius - headRadius, 0));
  return track(wasm.CrossSection.hull([tip, placedHead]));
}

/**
 * The template plate and its accent frame inlay. The caller owns the
 * returned manifolds.
 */
export function buildTemplateParts(
  wasm: ManifoldToplevel,
  params: TemplateParams,
): TemplatePart[] {
  return withGeometryScope((track) => {
    const outline = templateOutline(wasm, track, params);
    let body = track(wasm.Manifold.extrude(outline, params.thicknessMm));
    if (params.variant === 'round' && params.centerHoleMm > 0) {
      const hole = track(
        wasm.Manifold.cylinder(
          params.thicknessMm + 0.02,
          params.centerHoleMm / 2,
          params.centerHoleMm / 2,
          48,
          false,
        ),
      );
      body = track(body.subtract(track(hole.translate(0, 0, -0.01))));
    }
    const inner = track(outline.offset(-FRAME_WIDTH, 'Round', 2, 16));
    const frame = track(outline.subtract(inner));
    const parts: TemplatePart[] = [];
    if (frame.toPolygons().length > 0) {
      const inlayCut = track(wasm.Manifold.extrude(frame, INLAY_DEPTH + 0.01));
      const placedCut = track(inlayCut.translate(0, 0, params.thicknessMm - INLAY_DEPTH));
      parts.push({ name: 'template', solid: body.subtract(placedCut), accent: false });
      const inlay = track(wasm.Manifold.extrude(frame, INLAY_DEPTH));
      parts.push({
        name: 'accent',
        solid: inlay.translate(0, 0, params.thicknessMm - INLAY_DEPTH),
        accent: true,
      });
    } else {
      parts.push({ name: 'template', solid: body.translate(0, 0, 0), accent: false });
    }
    for (const part of parts) {
      const status = part.solid.status();
      if (status !== 'NoError') {
        for (const cleanup of parts) {
          cleanup.solid.delete();
        }
        throw new Error(`${ERROR_INVALID_TEMPLATE}${status}.`);
      }
    }
    return parts;
  });
}
