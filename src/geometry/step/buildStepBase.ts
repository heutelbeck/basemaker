import type { Font } from 'opentype.js';
import type { Shape3D } from 'replicad';
import { baseBottomOutline } from '../buildBase.ts';
import type { BaseParams } from '../../params/types.ts';
import { buildStepPlaque } from './buildStepPlaque.ts';
import { applyStepLettering, buildStepLetterParts, buildStepShape } from './buildStepShape.ts';

/**
 * All B-rep parts of a base for STEP export, in part order: the body,
 * the plaque with its engraving, and the letter solids clipped against
 * body plus plaque so they reach the plaque surface. This is the single
 * assembly recipe shared by the app export and the Node smoke script.
 */
export function buildStepBaseParts(params: BaseParams, font: Font | null): Shape3D[] {
  const hasLetters = params.lettering !== null && font !== null;
  const parts: Shape3D[] = [buildStepShape(params, font)];
  let letterReference: Shape3D | null = null;
  if (params.plaque !== null) {
    const plaqueRaw = buildStepPlaque(params, baseBottomOutline(params));
    if (plaqueRaw !== null) {
      if (hasLetters) {
        const bare = buildStepShape({ ...params, lettering: null });
        letterReference = bare.fuse(plaqueRaw.clone());
        parts.push(applyStepLettering(plaqueRaw, params, font));
      } else {
        parts.push(plaqueRaw);
      }
    }
  }
  if (hasLetters) {
    const letters = buildStepLetterParts(params, font, letterReference);
    if (letters !== null) {
      parts.push(letters);
    }
  }
  return parts;
}
