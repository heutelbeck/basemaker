import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { resolveShape } from '../../params/shapeMetrics.ts';
import type { ConverterSpec } from '../../params/types.ts';
import type { Track } from '../dispose.ts';
import { outsetOutline } from '../outlines.ts';
import { outlineFor } from '../tessellation.ts';
import { CUT_EPSILON } from './shell.ts';

/**
 * Cutter for the converter insert pocket: the insert footprint grown by the
 * clearance (a true parallel outset, so the fit is `clearance` mm everywhere,
 * including at sharp corners), cut down from the top face.
 */
export function converterInsertCutter(
  wasm: ManifoldToplevel,
  track: Track,
  converter: ConverterSpec,
  height: number,
  tolMm: number,
): Manifold {
  const insert = resolveShape(converter.insert);
  const outline = outlineFor(insert, tolMm);
  const grown = outsetOutline(wasm, outline, converter.clearance, tolMm);
  const prism = track(wasm.Manifold.extrude([grown], converter.insertDepth + CUT_EPSILON));
  return track(prism.translate(0, 0, height - converter.insertDepth));
}
