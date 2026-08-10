import type { LetteringFontFace, QualityParams } from './types.ts';
import type { ValidationIssue } from './validate.ts';

/**
 * Measuring aids for the tabletop. Sticks are rigid bars divided into
 * numbered cells of one unit each, with an accent frame, dividers, and
 * numbers as a flush colored inlay; long sticks can split into pieces
 * joined by dovetails for gluing. Chains are flexible rulers assembled
 * from separately printed links: numbered pills one unit long whose
 * tails or straps slide under the neighboring pill, joined either by
 * press-fit snap rivets or by magnet pockets, with clean full-thickness
 * ends on the first and last link.
 */
export interface RulerParams {
  variant: 'stick' | 'chain';
  connector: 'pin' | 'magnet';
  pivotsPerJoint: 1 | 2;
  unitLengthMm: number;
  units: number;
  widthMm: number;
  thicknessMm: number;
  magnetDiameterMm: number;
  magnetHeightMm: number;
  rotateNumbers: boolean;
  font: LetteringFontFace;
  accentColorHex: string;
  splitEveryUnits: number;
  quality: QualityParams;
}

export function defaultRulerParams(): RulerParams {
  return {
    variant: 'stick',
    connector: 'pin',
    pivotsPerJoint: 1,
    unitLengthMm: 25.4,
    units: 6,
    widthMm: 10,
    thicknessMm: 2.4,
    magnetDiameterMm: 3,
    magnetHeightMm: 2,
    rotateNumbers: true,
    font: 'sans',
    accentColorHex: '#39d353',
    splitEveryUnits: 0,
    quality: { chordTolMm: 0.02 },
  };
}

const ERROR_RULER_INVALID =
  'Rulers need a unit length of 5 to 100 mm, 1 to 20 units, a width of 6 to 30 mm, and a thickness of 1.6 to 6 mm.';
const ERROR_RULER_MAGNET_INVALID =
  'Chain magnets sit vertically at the pivots: the diameter must be at least 3 mm smaller than the width, and the thickness at least twice the magnet height plus 2 mm.';
const ERROR_RULER_PIN_THICKNESS =
  'Press-fit pin chains need at least 3.8 mm thickness for the tail, fit gap, and pill layers.';
const ERROR_RULER_PIECE_LENGTH =
  'Split every must be a whole number of units (0 keeps the stick in one piece).';

export function validateRuler(params: RulerParams): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const valid =
    params.unitLengthMm >= 5 &&
    params.unitLengthMm <= 100 &&
    Number.isInteger(params.units) &&
    params.units >= 1 &&
    params.units <= 20 &&
    params.widthMm >= 6 &&
    params.widthMm <= 30 &&
    params.thicknessMm >= 1.6 &&
    params.thicknessMm <= 6;
  if (!valid) {
    issues.push({ code: 'ruler-params', message: ERROR_RULER_INVALID });
  }
  if (
    params.variant === 'chain' &&
    params.connector === 'magnet' &&
    (!(params.magnetDiameterMm > 0) ||
      params.magnetDiameterMm > params.widthMm - 3 ||
      !(params.magnetHeightMm > 0) ||
      params.thicknessMm < 2 * params.magnetHeightMm + 2)
  ) {
    issues.push({ code: 'ruler-magnet', message: ERROR_RULER_MAGNET_INVALID });
  }
  if (params.variant === 'chain' && params.connector === 'pin' && params.thicknessMm < 3.8) {
    issues.push({ code: 'ruler-bend', message: ERROR_RULER_PIN_THICKNESS });
  }
  if (
    params.variant === 'stick' &&
    (!Number.isInteger(params.splitEveryUnits) || params.splitEveryUnits < 0)
  ) {
    issues.push({ code: 'ruler-piece', message: ERROR_RULER_PIECE_LENGTH });
  }
  return issues;
}
