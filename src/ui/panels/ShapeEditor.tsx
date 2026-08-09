import { PRESETS_BY_KIND } from '../../params/presets.ts';
import type { GwOvalPreset, ShapeSpec } from '../../params/types.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';

const KIND_LABELS: Record<ShapeSpec['kind'], string> = {
  round: 'Round',
  oval: 'Oval',
  gwOval: 'GW Oval',
  pill: 'Pill',
  square: 'Square',
  rect: 'Rectangle',
};

const GW_PRESET_VALUES: GwOvalPreset[] = ['60x35', '75x42', '90x52', '105x70', '120x92', '170x105'];

export function defaultShapeFor(kind: ShapeSpec['kind']): ShapeSpec {
  switch (kind) {
    case 'round':
      return { kind: 'round', diameter: 32 };
    case 'oval':
      return { kind: 'oval', length: 60, width: 35 };
    case 'gwOval':
      return { kind: 'gwOval', preset: '60x35' };
    case 'pill':
      return { kind: 'pill', length: 60, width: 25 };
    case 'square':
      return { kind: 'square', size: 25 };
    case 'rect':
      return { kind: 'rect', length: 50, width: 25 };
  }
}

interface ShapeEditorProps {
  shape: ShapeSpec;
  onChange: (shape: ShapeSpec) => void;
}

export function ShapeEditor({ shape, onChange }: ShapeEditorProps) {
  const presets = PRESETS_BY_KIND[shape.kind] ?? [];
  const activePreset = presets.find(
    (preset) => JSON.stringify(preset.shape) === JSON.stringify(shape),
  );

  return (
    <>
      <Select
        label="Shape"
        value={shape.kind}
        options={(Object.keys(KIND_LABELS) as ShapeSpec['kind'][]).map((kind) => ({
          value: kind,
          label: KIND_LABELS[kind],
        }))}
        onChange={(kind) => onChange(defaultShapeFor(kind as ShapeSpec['kind']))}
      />
      {presets.length > 0 && shape.kind !== 'gwOval' && (
        <Select
          label="Preset"
          value={activePreset?.label ?? 'custom'}
          options={[
            ...(activePreset === undefined ? [{ value: 'custom', label: 'Custom' }] : []),
            ...presets.map((preset) => ({ value: preset.label, label: preset.label })),
          ]}
          onChange={(label) => {
            const preset = presets.find((candidate) => candidate.label === label);
            if (preset !== undefined) {
              onChange(preset.shape);
            }
          }}
        />
      )}
      {shape.kind === 'round' && (
        <NumberField
          label="Diameter"
          unit="mm"
          value={shape.diameter}
          min={5}
          onChange={(diameter) => onChange({ kind: 'round', diameter })}
        />
      )}
      {shape.kind === 'gwOval' && (
        <Select
          label="Size"
          value={shape.preset}
          options={GW_PRESET_VALUES.map((preset) => ({ value: preset, label: `${preset} mm` }))}
          onChange={(preset) => onChange({ kind: 'gwOval', preset: preset as GwOvalPreset })}
        />
      )}
      {(shape.kind === 'oval' || shape.kind === 'pill' || shape.kind === 'rect') && (
        <div className="field-row">
          <NumberField
            label="Length"
            unit="mm"
            value={shape.length}
            min={5}
            onChange={(length) => onChange({ ...shape, length })}
          />
          <NumberField
            label="Width"
            unit="mm"
            value={shape.width}
            min={5}
            onChange={(width) => onChange({ ...shape, width })}
          />
        </div>
      )}
      {shape.kind === 'square' && (
        <NumberField
          label="Size"
          unit="mm"
          value={shape.size}
          min={5}
          onChange={(size) => onChange({ kind: 'square', size })}
        />
      )}
    </>
  );
}
