import type { QualityParams } from './types.ts';
import type { ValidationIssue } from './validate.ts';

/**
 * Faceted tactical rock with a flat bottom and a guaranteed flat top spot
 * for mounting a miniature.
 */
export interface RockParams {
  sizeMm: number;
  heightMm: number;
  irregularity: number;
  jaggedness: number;
  flatSpotDiameter: number;
  seed: number;
  quality: QualityParams;
}

/**
 * Cluster of faceted crystals on a basal pad. Tilts are clamped to the
 * printable cone, so clusters print support-free.
 */
export interface CrystalParams {
  count: number;
  heightMm: number;
  radiusMm: number;
  spreadMm: number;
  padRadiusMm: number;
  maxTiltDeg: number;
  sides: number;
  seed: number;
  quality: QualityParams;
}

/**
 * Support-free plant tufts on a basal pad. Every stem direction stays
 * inside the printability cone of the chosen profile, and members never
 * get thinner than the profile's minimum feature size.
 */
export interface PlantParams {
  variety: 'grass' | 'reeds' | 'mushrooms';
  heightMm: number;
  count: number;
  spreadMm: number;
  padRadiusMm: number;
  profile: 'fdm' | 'resin';
  seed: number;
  quality: QualityParams;
}

export const PRINT_PROFILES = {
  fdm: { maxLeanDeg: 40, minRadius: 0.35 },
  resin: { maxLeanDeg: 55, minRadius: 0.15 },
} as const;

export function defaultRockParams(): RockParams {
  return {
    sizeMm: 20,
    heightMm: 9,
    irregularity: 0.5,
    jaggedness: 0.35,
    flatSpotDiameter: 8,
    seed: 1,
    quality: { chordTolMm: 0.02 },
  };
}

export function defaultCrystalParams(): CrystalParams {
  return {
    count: 5,
    heightMm: 18,
    radiusMm: 3,
    spreadMm: 7,
    padRadiusMm: 11.5,
    maxTiltDeg: 20,
    sides: 6,
    seed: 1,
    quality: { chordTolMm: 0.02 },
  };
}

export function defaultPlantParams(): PlantParams {
  return {
    variety: 'grass',
    heightMm: 10,
    count: 9,
    spreadMm: 5,
    padRadiusMm: 6.5,
    profile: 'fdm',
    seed: 1,
    quality: { chordTolMm: 0.02 },
  };
}

const ERROR_CRYSTAL_INVALID =
  'Crystals need 1 to 20 shafts with 4 to 8 sides, positive dimensions, a tilt of at most 35 degrees, and a pad that spans the spread plus the shaft radius.';
const ERROR_PLANT_INVALID =
  'Plants need 1 to 40 stems with positive height and spread, a pad at least 1 mm beyond the spread; heights above 25 mm get too fragile.';
const ERROR_ROCK_INVALID =
  'The rock size and height must be positive, the height at most twice the size, and the flat spot smaller than 80 percent of the size.';

export function validateRock(params: RockParams): ValidationIssue[] {
  const valid =
    params.sizeMm > 0 &&
    params.heightMm > 0 &&
    params.heightMm <= params.sizeMm * 2 &&
    params.irregularity >= 0 &&
    params.irregularity <= 1 &&
    params.jaggedness >= 0 &&
    params.jaggedness <= 1 &&
    params.flatSpotDiameter > 0 &&
    params.flatSpotDiameter <= params.sizeMm * 0.8;
  return valid ? [] : [{ code: 'rock-params', message: ERROR_ROCK_INVALID }];
}

export function validateCrystal(params: CrystalParams): ValidationIssue[] {
  const valid =
    Number.isInteger(params.count) &&
    params.count >= 1 &&
    params.count <= 20 &&
    params.heightMm > 0 &&
    params.radiusMm > 0 &&
    params.spreadMm >= 0 &&
    params.padRadiusMm >= params.spreadMm + params.radiusMm &&
    params.maxTiltDeg >= 0 &&
    params.maxTiltDeg <= 35 &&
    Number.isInteger(params.sides) &&
    params.sides >= 4 &&
    params.sides <= 8;
  return valid ? [] : [{ code: 'crystal-params', message: ERROR_CRYSTAL_INVALID }];
}

export function validatePlant(params: PlantParams): ValidationIssue[] {
  const valid =
    Number.isInteger(params.count) &&
    params.count >= 1 &&
    params.count <= 40 &&
    params.heightMm > 0 &&
    params.heightMm <= 25 &&
    params.spreadMm >= 0 &&
    params.padRadiusMm >= params.spreadMm + 1;
  return valid ? [] : [{ code: 'plant-params', message: ERROR_PLANT_INVALID }];
}
