import type { SurfaceParams } from './surface.ts';

export type GwOvalPreset = '60x35' | '75x42' | '90x52' | '105x70' | '120x92' | '170x105';

export type ShapeSpec =
  | { kind: 'round'; diameter: number }
  | { kind: 'oval'; length: number; width: number }
  | { kind: 'gwOval'; preset: GwOvalPreset }
  | { kind: 'pill'; length: number; width: number }
  | { kind: 'square'; size: number }
  | { kind: 'rect'; length: number; width: number }
  | { kind: 'hex'; size: number };

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
  style: 'pillars' | 'grid';
  spacing: number;
  diameter: number;
}

export interface HollowParams {
  wall: number;
  topThickness: number;
  supports: SupportParams | null;
}

export type MagnetLayout = 'line' | 'grid' | 'even';

export interface MagnetParams {
  shape: 'round' | 'rect';
  layout: MagnetLayout;
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

/**
 * Embedded letters cut the surface and fill the recess as a colored part;
 * raised letters stand on it; recessed letters cut only, leaving an empty
 * engraving for painting.
 */
export type LetteringStyle = 'engraved' | 'embossed' | 'recessed';
export type LetteringPlacement = 'top' | 'side';
/**
 * Bundled faces plus arbitrary local system font family names. Unknown
 * names fall back to the bundled sans face when the font bytes are not
 * registered in the current session.
 */
export type LetteringFontFace = string;

/**
 * Text along the rim of a round base, engraved into or embossed onto the
 * top face or the side wall, exported as a separate 3MF object so
 * multi-material printers can color it.
 */
/**
 * Average glyph advance as a fraction of the lettering size, used to
 * estimate text width for layout validation before any font is loaded.
 */
export const APPROX_ADVANCE_RATIO = 0.86;

export interface LetteringParams {
  text: string;
  sizeMm: number;
  depth: number;
  margin: number;
  angleDeg: number;
  colorHex: string;
  strokeBoostMm: number;
  style: LetteringStyle;
  placement: LetteringPlacement;
  font: LetteringFontFace;
}

export type PlaqueStyle = 'plate' | 'scroll';

/**
 * Decorative name tablet on the side wall of a round base: a riveted
 * steel plate or a parchment scroll with rolled ends. Side lettering at
 * the same angle lands on the plaque face.
 */
export interface PlaqueParams {
  style: PlaqueStyle;
  widthMm: number;
  heightMm: number;
  angleDeg: number;
  thicknessMm: number;
  rivetHeightMm: number;
  colorHex: string;
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
  plaque: PlaqueParams | null;
  surface: SurfaceParams | null;
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

/**
 * Side slope per unit height measured from an original WHFB/TOW infantry
 * base (1.3 mm slope over 3.4 mm height), so trays of any height can
 * default to the same lean angle as the bases they carry.
 */
export const TOW_SLOPE_RATIO = 1.3 / 3.4;

/** The TOW lean angle extrapolated to a body of the given height. */
export function towEdgeSlopeFor(height: number): number {
  return Number((height * TOW_SLOPE_RATIO).toFixed(2));
}

export function defaultParams(): BaseParams {
  return {
    shape: { kind: 'round', diameter: 32 },
    height: 3.4,
    edgeSlope: 1.3,
    lipRadius: 0,
    hollow: null,
    magnets: null,
    recess: null,
    slotta: null,
    lettering: null,
    plaque: null,
    surface: null,
    quality: { chordTolMm: 0.02 },
  };
}
