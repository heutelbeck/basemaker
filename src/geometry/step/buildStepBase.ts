import type { Font } from 'opentype.js';
import type { Shape3D } from 'replicad';
import { baseBottomOutline } from '../buildBase.ts';
import { fontFor } from '../lettering/font.ts';
import type { BaseParams } from '../../params/types.ts';
import { plaqueVariants } from '../../params/types.ts';
import { buildStepPlaque } from './buildStepPlaque.ts';
import { applyStepLettering, buildStepLetterParts, buildStepShape } from './buildStepShape.ts';

const ERROR_PLAQUE_FONT_MISSING = 'Plaque text requires its font to be loaded before building.';

/**
 * All B-rep parts of a base for STEP export, in part order: the body,
 * each configured plaque with its own text engraved, the letter solids
 * of each plaque text, and the rim letter solids. Letter solids are
 * clipped against body plus plaques so they reach the visible surface.
 * This is the single assembly recipe shared by the app export and the
 * Node smoke script.
 */
export function buildStepBaseParts(params: BaseParams, font: Font | null): Shape3D[] {
  const hasLetterCut = params.lettering !== null && font !== null;
  const hasLetterPart = hasLetterCut && params.lettering?.style !== 'recessed';
  const variants = plaqueVariants(params);
  const parts: Shape3D[] = [buildStepShape(params, font)];
  const outline = variants.length > 0 ? baseBottomOutline(params) : null;
  const raws = variants.map((variant) =>
    outline === null ? null : buildStepPlaque(variant, outline),
  );
  const variantFonts = variants.map((variant) => {
    if (variant.lettering === null) {
      return null;
    }
    const variantFont = fontFor(variant.lettering.font);
    if (variantFont === null) {
      throw new Error(ERROR_PLAQUE_FONT_MISSING);
    }
    return variantFont;
  });
  let letterReference: Shape3D | null = null;
  const needsReference =
    hasLetterPart ||
    variants.some(
      (variant) => variant.lettering !== null && variant.lettering.style !== 'recessed',
    );
  if (needsReference) {
    let reference = buildStepShape({ ...params, lettering: null });
    for (const raw of raws) {
      if (raw !== null) {
        reference = reference.fuse(raw.clone());
      }
    }
    letterReference = reference;
  }
  variants.forEach((variant, index) => {
    const raw = raws[index];
    if (raw === null) {
      return;
    }
    const variantFont = variantFonts[index];
    parts.push(
      variant.lettering !== null && variantFont !== null
        ? applyStepLettering(raw, variant, variantFont)
        : raw,
    );
    if (
      variant.lettering !== null &&
      variantFont !== null &&
      variant.lettering.style !== 'recessed'
    ) {
      const letters = buildStepLetterParts(variant, variantFont, letterReference);
      if (letters !== null) {
        parts.push(letters);
      }
    }
  });
  if (hasLetterPart) {
    const letters = buildStepLetterParts(params, font, letterReference);
    if (letters !== null) {
      parts.push(letters);
    }
  }
  return parts;
}
