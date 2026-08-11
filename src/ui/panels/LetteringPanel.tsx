import type { LetteringParams, PlaqueParams, PlaqueTextParams } from '../../params/types.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { FontPicker } from '../controls/FontPicker.tsx';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Section } from './Section.tsx';

const DEFAULT_LETTERING: LetteringParams = {
  text: 'HERO',
  sizeMm: 1.2,
  depth: 0.6,
  margin: 2,
  angleDeg: -90,
  colorHex: '#e8833a',
  strokeBoostMm: 0,
  style: 'engraved',
  placement: 'side',
  font: 'sans',
};

const DEFAULT_PLAQUE: PlaqueParams = {
  style: 'plate',
  widthMm: 16,
  heightMm: 2.6,
  angleDeg: -90,
  thicknessMm: 0.7,
  rivetHeightMm: 0.2,
  colorHex: '#9AA5B1',
  text: null,
};

const DEFAULT_PLAQUE_TEXT: PlaqueTextParams = {
  text: 'HERO',
  sizeMm: 1.2,
  depth: 0.6,
  strokeBoostMm: 0,
  style: 'engraved',
  font: 'sans',
  colorHex: '#e8833a',
};

const STYLE_OPTIONS = [
  { value: 'engraved', label: 'Embedded (flush inlay)' },
  { value: 'embossed', label: 'Raised' },
  { value: 'recessed', label: 'Engraved (empty recess)' },
];

const SIDE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  square: [
    { value: '-90', label: 'Front' },
    { value: '0', label: 'Right' },
    { value: '90', label: 'Back' },
    { value: '180', label: 'Left' },
  ],
  rect: [
    { value: '-90', label: 'Front (long side)' },
    { value: '0', label: 'Right (short side)' },
    { value: '90', label: 'Back (long side)' },
    { value: '180', label: 'Left (short side)' },
  ],
  hex: [
    { value: '-90', label: 'Front' },
    { value: '-30', label: 'Front right' },
    { value: '30', label: 'Back right' },
    { value: '90', label: 'Back' },
    { value: '150', label: 'Back left' },
    { value: '-150', label: 'Front left' },
  ],
  oval: [
    { value: '-90', label: 'Wide front' },
    { value: '90', label: 'Wide back' },
    { value: '0', label: 'Narrow right' },
    { value: '180', label: 'Narrow left' },
  ],
};

function plaqueSideOptions(kind: string): { value: string; label: string }[] | null {
  if (kind === 'square' || kind === 'rect' || kind === 'hex') {
    return SIDE_OPTIONS[kind];
  }
  if (kind === 'oval' || kind === 'gwOval' || kind === 'pill') {
    return SIDE_OPTIONS.oval;
  }
  return null;
}

function PlaqueTextFields({
  text,
  onChange,
}: {
  text: PlaqueTextParams;
  onChange: (change: Partial<PlaqueTextParams>) => void;
}) {
  return (
    <>
      <label className="field">
        <span className="field-label">Text</span>
        <input
          type="text"
          value={text.text}
          maxLength={24}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </label>
      <div className="field-row">
        <Select
          label="Text style"
          value={text.style}
          options={STYLE_OPTIONS}
          onChange={(style) => onChange({ style: style as PlaqueTextParams['style'] })}
        />
        <NumberField
          label="Size"
          unit="mm"
          value={text.sizeMm}
          min={0.5}
          step={0.1}
          onChange={(sizeMm) => onChange({ sizeMm })}
        />
        <NumberField
          label="Depth"
          unit="mm"
          value={text.depth}
          min={0.2}
          step={0.1}
          onChange={(depth) => onChange({ depth })}
        />
        <NumberField
          label="Stroke boost"
          unit="mm"
          value={text.strokeBoostMm}
          min={0}
          max={0.4}
          step={0.05}
          onChange={(strokeBoostMm) => onChange({ strokeBoostMm })}
        />
      </div>
      <FontPicker value={text.font} onChange={(font) => onChange({ font })} />
      {text.style !== 'recessed' && (
        <label className="field">
          <span className="field-label">Text color (3MF export)</span>
          <input
            type="color"
            value={text.colorHex}
            onChange={(event) => onChange({ colorHex: event.target.value })}
          />
        </label>
      )}
    </>
  );
}

function PlaqueFields({
  plaque,
  sideOptions,
  onChange,
}: {
  plaque: PlaqueParams;
  sideOptions: { value: string; label: string }[] | null;
  onChange: (change: Partial<PlaqueParams>) => void;
}) {
  return (
    <>
      <div className="field-row">
        <Select
          label="Style"
          value={plaque.style}
          options={[
            { value: 'plate', label: 'Riveted plate' },
            { value: 'scroll', label: 'Scroll' },
          ]}
          onChange={(style) =>
            onChange({
              style: style as PlaqueParams['style'],
              thicknessMm: style === 'scroll' ? 0.4 : 0.7,
            })
          }
        />
        {sideOptions === null ? (
          <NumberField
            label="Position"
            unit="deg"
            value={plaque.angleDeg}
            step={15}
            onChange={(angleDeg) => onChange({ angleDeg })}
          />
        ) : (
          <Select
            label="Side"
            value={String(plaque.angleDeg)}
            options={sideOptions}
            onChange={(angle) => onChange({ angleDeg: Number(angle) })}
          />
        )}
      </div>
      <div className="field-row">
        <NumberField
          label="Width"
          unit="mm"
          value={plaque.widthMm}
          min={4}
          step={1}
          onChange={(widthMm) => onChange({ widthMm })}
        />
        <NumberField
          label="Height"
          unit="mm"
          value={plaque.heightMm}
          min={1}
          step={0.2}
          onChange={(heightMm) => onChange({ heightMm })}
        />
        <NumberField
          label="Thickness"
          unit="mm"
          value={plaque.thicknessMm}
          min={0.2}
          max={2}
          step={0.1}
          onChange={(thicknessMm) => onChange({ thicknessMm })}
        />
        {plaque.style === 'plate' && (
          <NumberField
            label="Rivet height"
            unit="mm"
            value={plaque.rivetHeightMm}
            min={0.05}
            max={0.6}
            step={0.05}
            onChange={(rivetHeightMm) => onChange({ rivetHeightMm })}
          />
        )}
      </div>
      <label className="field">
        <span className="field-label">Plaque color (3MF export)</span>
        <input
          type="color"
          value={plaque.colorHex}
          onChange={(event) => onChange({ colorHex: event.target.value })}
        />
      </label>
      <Toggle
        label="Text on this plaque"
        checked={plaque.text !== null}
        onChange={(enabled) => onChange({ text: enabled ? DEFAULT_PLAQUE_TEXT : null })}
      />
      {plaque.text !== null && (
        <PlaqueTextFields
          text={plaque.text}
          onChange={(change) =>
            onChange({ text: plaque.text === null ? null : { ...plaque.text, ...change } })
          }
        />
      )}
    </>
  );
}

export function SidePlaquePanel() {
  const plaque = useBaseParams().plaque;
  const plaqueBack = useBaseParams().plaqueBack;
  const shape = useBaseParams().shape;
  const shapeKind = shape.kind === 'converter' ? shape.outer.kind : shape.kind;
  const sideOptions = plaqueSideOptions(shapeKind);

  return (
    <Section
      title="Side plaques"
      enabled={plaque !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({
          ...current,
          plaque: enabled ? DEFAULT_PLAQUE : null,
          plaqueBack: null,
          lettering: enabled ? null : current.lettering,
        }))
      }
    >
      {plaque !== null && (
        <>
          <PlaqueFields
            plaque={plaque}
            sideOptions={sideOptions}
            onChange={(change) =>
              setBaseParams((current) => ({
                ...current,
                plaque: current.plaque === null ? null : { ...current.plaque, ...change },
              }))
            }
          />
          <Toggle
            label="Second plaque on the opposite side"
            checked={plaqueBack !== null}
            onChange={(enabled) =>
              setBaseParams((current) => ({
                ...current,
                plaqueBack:
                  enabled && current.plaque !== null
                    ? { ...current.plaque, angleDeg: current.plaque.angleDeg + 180, text: null }
                    : null,
              }))
            }
          />
          {plaqueBack !== null && (
            <PlaqueFields
              plaque={plaqueBack}
              sideOptions={sideOptions}
              onChange={(change) =>
                setBaseParams((current) => ({
                  ...current,
                  plaqueBack:
                    current.plaqueBack === null ? null : { ...current.plaqueBack, ...change },
                }))
              }
            />
          )}
          <p className="freeform-hint">
            Up to two independently configured tablets on the side wall, each with its own
            style, size, color, and text (name on the front, squad number on the back).
            Plaque text replaces rim lettering; both cannot be combined. Text needs a round
            base.
          </p>
        </>
      )}
    </Section>
  );
}

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
          plaque: enabled ? null : current.plaque,
          plaqueBack: enabled ? null : current.plaqueBack,
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
              options={STYLE_OPTIONS}
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
          </div>
          <FontPicker value={lettering.font} onChange={(font) => update({ font })} />
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
            <NumberField
              label="Stroke boost"
              unit="mm"
              value={lettering.strokeBoostMm}
              min={0}
              max={0.4}
              step={0.05}
              onChange={(strokeBoostMm) => update({ strokeBoostMm })}
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
          {lettering.style !== 'recessed' && (
            <label className="field">
              <span className="field-label">Letter color (3MF export)</span>
              <input
                type="color"
                value={lettering.colorHex}
                onChange={(event) => update({ colorHex: event.target.value })}
              />
            </label>
          )}
          <p className="freeform-hint">
            Embedded letters sit flush in the surface, raised letters stand on it (both export as
            their own colored part); engraved letters leave an empty recess for painting. For
            multi-color FDM, letters need about 2.5 mm size with a 0.4 mm nozzle or about 1.2 mm
            with a 0.2 mm nozzle - below that, use stroke boost to fatten thin strokes, or engrave
            and paint. Rim lettering replaces side plaques; use plaque text to write on a plaque.
          </p>
        </>
      )}
    </Section>
  );
}
