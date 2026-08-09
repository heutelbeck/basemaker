import type { LetteringParams } from '../../params/types.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

const DEFAULT_LETTERING: LetteringParams = {
  text: 'HERO',
  sizeMm: 4,
  depth: 0.6,
  margin: 2,
  angleDeg: -90,
  colorHex: '#e8833a',
  style: 'engraved',
  placement: 'top',
  font: 'sans',
};

export function LetteringPanel() {
  const lettering = useBaseParams().lettering;

  const update = (change: Partial<LetteringParams>) => {
    setBaseParams((current) => ({
      ...current,
      lettering: current.lettering === null ? null : { ...current.lettering, ...change },
    }));
  };

  return (
    <Section
      title="Rim lettering"
      enabled={lettering !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({
          ...current,
          lettering: enabled ? DEFAULT_LETTERING : null,
        }))
      }
    >
      {lettering !== null && (
        <>
          <label className="field">
            <span className="field-label">Text</span>
            <input
              type="text"
              value={lettering.text}
              maxLength={24}
              onChange={(event) => update({ text: event.target.value })}
            />
          </label>
          <div className="field-row">
            <Select
              label="Style"
              value={lettering.style}
              options={[
                { value: 'engraved', label: 'Engraved' },
                { value: 'embossed', label: 'Embossed' },
              ]}
              onChange={(style) => update({ style: style as LetteringParams['style'] })}
            />
            <Select
              label="Placement"
              value={lettering.placement}
              options={[
                { value: 'top', label: 'Top face' },
                { value: 'side', label: 'Side wall' },
              ]}
              onChange={(placement) =>
                update({ placement: placement as LetteringParams['placement'] })
              }
            />
            <Select
              label="Font"
              value={lettering.font}
              options={[
                { value: 'sans', label: 'Sans' },
                { value: 'serif', label: 'Serif' },
                { value: 'mono', label: 'Mono' },
              ]}
              onChange={(font) => update({ font: font as LetteringParams['font'] })}
            />
          </div>
          <div className="field-row">
            <NumberField
              label="Size"
              unit="mm"
              value={lettering.sizeMm}
              min={1}
              step={0.5}
              onChange={(sizeMm) => update({ sizeMm })}
            />
            <NumberField
              label="Depth"
              unit="mm"
              value={lettering.depth}
              min={0.2}
              step={0.1}
              onChange={(depth) => update({ depth })}
            />
          </div>
          <div className="field-row">
            {lettering.placement === 'top' && (
              <NumberField
                label="Margin"
                unit="mm"
                value={lettering.margin}
                min={0}
                step={0.25}
                onChange={(margin) => update({ margin })}
              />
            )}
            <NumberField
              label="Position"
              unit="deg"
              value={lettering.angleDeg}
              step={15}
              onChange={(angleDeg) => update({ angleDeg })}
            />
          </div>
          <label className="field">
            <span className="field-label">Letter color (3MF export)</span>
            <input
              type="color"
              value={lettering.colorHex}
              onChange={(event) => update({ colorHex: event.target.value })}
            />
          </label>
          <p className="freeform-hint">
            Letters are engraved into the top face along the rim and exported as a second 3MF object
            for multi-material printing.
          </p>
        </>
      )}
    </Section>
  );
}
