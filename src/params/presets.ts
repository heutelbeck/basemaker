import type { ShapeSpec } from './types.ts';
import { GW_OVAL_SIZES } from './types.ts';

export interface SizePreset {
  label: string;
  shape: ShapeSpec;
}

export const ROUND_PRESETS: SizePreset[] = [25, 28.5, 32, 40, 50, 60, 80, 100, 130, 160].map(
  (diameter) => ({ label: `${diameter} mm`, shape: { kind: 'round', diameter } }),
);

export const GW_OVAL_PRESETS: SizePreset[] = (
  Object.keys(GW_OVAL_SIZES) as (keyof typeof GW_OVAL_SIZES)[]
).map((preset) => ({ label: `${preset} mm`, shape: { kind: 'gwOval', preset } }));

export const OVAL_PRESETS: SizePreset[] = [
  { label: '60x35 mm', shape: { kind: 'oval', length: 60, width: 35 } },
  { label: '75x42 mm', shape: { kind: 'oval', length: 75, width: 42 } },
  { label: '90x52 mm', shape: { kind: 'oval', length: 90, width: 52 } },
];

export const PILL_PRESETS: SizePreset[] = [
  { label: '75x25 mm', shape: { kind: 'pill', length: 75, width: 25 } },
  { label: '60x35 mm', shape: { kind: 'pill', length: 60, width: 35 } },
];

export const SQUARE_PRESETS: SizePreset[] = [20, 25, 30, 40, 50].map((size) => ({
  label: `${size} mm`,
  shape: { kind: 'square', size },
}));

export const HEX_PRESETS: SizePreset[] = [20, 25, 30, 35].map((size) => ({
  label: `${size} mm`,
  shape: { kind: 'hex', size },
}));

export const RECT_PRESETS: SizePreset[] = [
  { label: '50x25 mm', shape: { kind: 'rect', length: 50, width: 25 } },
  { label: '75x50 mm', shape: { kind: 'rect', length: 75, width: 50 } },
  { label: '100x50 mm', shape: { kind: 'rect', length: 100, width: 50 } },
];

export const PRESETS_BY_KIND: Partial<Record<ShapeSpec['kind'], SizePreset[]>> = {
  round: ROUND_PRESETS,
  oval: OVAL_PRESETS,
  gwOval: GW_OVAL_PRESETS,
  pill: PILL_PRESETS,
  square: SQUARE_PRESETS,
  rect: RECT_PRESETS,
  hex: HEX_PRESETS,
};
