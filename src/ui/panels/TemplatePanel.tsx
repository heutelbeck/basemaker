import type { TemplateParams } from '../../params/template.ts';
import { useAppStore } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

interface TemplatePreset {
  label: string;
  change: Partial<TemplateParams>;
}

const PRESETS: TemplatePreset[] = [
  { label: 'Small blast 3"', change: { variant: 'round', diameterMm: 76.2 } },
  { label: 'Large blast 5"', change: { variant: 'round', diameterMm: 127 } },
  { label: 'Apocalypse 10"', change: { variant: 'round', diameterMm: 254 } },
  {
    label: 'Flame 8"x3"',
    change: { variant: 'teardrop', lengthMm: 203.2, widthMm: 76.2, tipMm: 25 },
  },
];

export function TemplatePanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'template') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<TemplateParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'template'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  return (
    <Section title="Area template">
      <div className="quality-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="chip"
            onClick={() => update(preset.change)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <Select
        label="Shape"
        value={params.variant}
        options={[
          { value: 'round', label: 'Round blast marker' },
          { value: 'teardrop', label: 'Teardrop flame template' },
        ]}
        onChange={(variant) => update({ variant: variant as TemplateParams['variant'] })}
      />
      <div className="field-row">
        {params.variant === 'round' ? (
          <>
            <NumberField
              label="Diameter"
              unit="mm"
              value={params.diameterMm}
              min={20}
              step={1}
              onChange={(diameterMm) => update({ diameterMm })}
            />
            <NumberField
              label="Center hole"
              unit="mm"
              value={params.centerHoleMm}
              min={0}
              step={0.5}
              onChange={(centerHoleMm) => update({ centerHoleMm })}
            />
          </>
        ) : (
          <>
            <NumberField
              label="Length"
              unit="mm"
              value={params.lengthMm}
              min={40}
              step={1}
              onChange={(lengthMm) => update({ lengthMm })}
            />
            <NumberField
              label="Width"
              unit="mm"
              value={params.widthMm}
              min={20}
              step={1}
              onChange={(widthMm) => update({ widthMm })}
            />
            <NumberField
              label="Tip"
              unit="mm"
              value={params.tipMm}
              min={5}
              step={1}
              onChange={(tipMm) => update({ tipMm })}
            />
          </>
        )}
        <NumberField
          label="Thickness"
          unit="mm"
          value={params.thicknessMm}
          min={1}
          max={6}
          step={0.2}
          onChange={(thicknessMm) => update({ thicknessMm })}
        />
      </div>
      <label className="field">
        <span className="field-label">Accent color (3MF export)</span>
        <input
          type="color"
          value={params.accentColorHex}
          onChange={(event) => update({ accentColorHex: event.target.value })}
        />
      </label>
      <p className="freeform-hint">
        Classic table aid dimensions: blasts are 3, 5, or 10 inch circles with a center hole,
        the flame template is an 8 by 3 inch teardrop. The colored frame exports as its own
        part for multi-material printing.
      </p>
    </Section>
  );
}
