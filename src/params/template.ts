import type { QualityParams } from './types.ts';
import type { ValidationIssue } from './validate.ts';

/**
 * Area templates in the style of the classic game aids: round blast
 * markers (3 and 5 inch, 10 inch apocalypse) and the teardrop flame
 * template (8 by 3 inch), as thin plates with an accent frame inlay and
 * an optional center hole on round markers.
 */
export interface TemplateParams {
  variant: 'round' | 'teardrop';
  diameterMm: number;
  lengthMm: number;
  widthMm: number;
  tipMm: number;
  thicknessMm: number;
  centerHoleMm: number;
  accentColorHex: string;
  quality: QualityParams;
}

export function defaultTemplateParams(): TemplateParams {
  return {
    variant: 'round',
    diameterMm: 76.2,
    lengthMm: 203.2,
    widthMm: 76.2,
    tipMm: 25,
    thicknessMm: 2.4,
    centerHoleMm: 3,
    accentColorHex: '#39d353',
    quality: { chordTolMm: 0.02 },
  };
}

const ERROR_TEMPLATE_INVALID =
  'Templates need a diameter or width of 20 to 300 mm, a teardrop length above its width, a tip smaller than the width, a thickness of 1 to 6 mm, and a center hole smaller than a quarter of the diameter.';

export function validateTemplate(params: TemplateParams): ValidationIssue[] {
  const roundValid =
    params.variant !== 'round' ||
    (params.diameterMm >= 20 &&
      params.diameterMm <= 300 &&
      params.centerHoleMm >= 0 &&
      params.centerHoleMm <= params.diameterMm / 4);
  const teardropValid =
    params.variant !== 'teardrop' ||
    (params.widthMm >= 20 &&
      params.widthMm <= 300 &&
      params.lengthMm > params.widthMm &&
      params.tipMm >= 5 &&
      params.tipMm < params.widthMm);
  const valid =
    roundValid && teardropValid && params.thicknessMm >= 1 && params.thicknessMm <= 6;
  return valid ? [] : [{ code: 'template-params', message: ERROR_TEMPLATE_INVALID }];
}
