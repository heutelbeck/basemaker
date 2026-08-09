export type GwOvalPreset = '60x35' | '75x42' | '90x52' | '105x70' | '120x92' | '170x105';

export type ShapeSpec =
  | { kind: 'round'; diameter: number }
  | { kind: 'oval'; length: number; width: number }
  | { kind: 'gwOval'; preset: GwOvalPreset }
  | { kind: 'pill'; length: number; width: number }
  | { kind: 'square'; size: number }
  | { kind: 'rect'; length: number; width: number };

export interface ConverterSpec {
  kind: 'converter';
  outer: ShapeSpec;
  insert: ShapeSpec;
  insertDepth: number;
  clearance: number;
}

/**
 * Hand-drawn organic footprint. In polygon and smooth modes the points are
 * outline vertices (smooth interpolates a closed spline through them); in
 * circles mode each point is a circle center with a radius from `radii`,
 * and the outline is the tangent hull around all circles.
 */
export interface FreeformSpec {
  kind: 'freeform';
  mode: 'polygon' | 'smooth' | 'circles';
  points: [number, number][];
  radii: number[];
}

export type BaseShape = ShapeSpec | ConverterSpec | FreeformSpec;

/**
 * Auto-generated support pillars inside a hollow base: a center-symmetric
 * grid that keeps the top plate of larger bases from getting flimsy.
 */
export interface SupportParams {
  spacing: number;
  diameter: number;
}

export interface HollowParams {
  wall: number;
  topThickness: number;
  supports: SupportParams | null;
}

export interface MagnetParams {
  shape: 'round' | 'rect';
  diameter: number;
  length: number;
  width: number;
  depth: number;
  count: number;
  spacing: number;
  offsetX: number;
  offsetY: number;
  padding: number;
}

export interface RecessParams {
  depth: number;
  inset: number;
}

export interface SlottaParams {
  length: number;
  width: number;
  angleDeg: number;
  offsetX: number;
  offsetY: number;
}

export type LetteringStyle = 'engraved' | 'embossed';
export type LetteringPlacement = 'top' | 'side';
export type LetteringFontFace = 'sans' | 'serif' | 'mono';

/**
 * Text along the rim of a round base, engraved into or embossed onto the
 * top face or the side wall, exported as a separate 3MF object so
 * multi-material printers can color it.
 */
export interface LetteringParams {
  text: string;
  sizeMm: number;
  depth: number;
  margin: number;
  angleDeg: number;
  colorHex: string;
  style: LetteringStyle;
  placement: LetteringPlacement;
  font: LetteringFontFace;
}

export interface QualityParams {
  chordTolMm: number;
}

export interface BaseParams {
  shape: BaseShape;
  height: number;
  edgeSlope: number;
  lipRadius: number;
  hollow: HollowParams | null;
  magnets: MagnetParams | null;
  recess: RecessParams | null;
  slotta: SlottaParams | null;
  lettering: LetteringParams | null;
  quality: QualityParams;
}

/**
 * Wall thickness of the rim that surrounds a slotta slot inside a hollow
 * base, so a slotted tab has material to grip on all sides.
 */
export const SLOTTA_RIM = 1.5;

export const GW_OVAL_SIZES: Record<GwOvalPreset, { length: number; width: number }> = {
  '60x35': { length: 60, width: 35 },
  '75x42': { length: 75, width: 42 },
  '90x52': { length: 90, width: 52 },
  '105x70': { length: 105, width: 70 },
  '120x92': { length: 120, width: 92 },
  '170x105': { length: 170, width: 105 },
};

export function defaultParams(): BaseParams {
  return {
    shape: { kind: 'round', diameter: 32 },
    height: 4,
    edgeSlope: 1.5,
    lipRadius: 0,
    hollow: null,
    magnets: null,
    recess: null,
    slotta: null,
    lettering: null,
    quality: { chordTolMm: 0.02 },
  };
}
