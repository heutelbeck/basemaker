import { useRef, useState } from 'react';
import type { LetteringParams, PlaqueParams } from '../../params/types.ts';
import { registerLetteringFont, setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

const DEFAULT_LETTERING: LetteringParams = {
  text: 'HERO',
  sizeMm: 1.2,
  depth: 0.6,
  margin: 2,
  angleDeg: -90,
  colorHex: '#e8833a',
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
};

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

export function SidePlaquePanel() {
  const plaque = useBaseParams().plaque;
  const shape = useBaseParams().shape;
  const shapeKind = shape.kind === 'converter' ? shape.outer.kind : shape.kind;
  const sideOptions = plaqueSideOptions(shapeKind);

  const update = (change: Partial<PlaqueParams>) => {
    setBaseParams((current) => ({
      ...current,
      plaque: current.plaque === null ? null : { ...current.plaque, ...change },
    }));
  };

  return (
    <Section
      title="Side plaque"
      enabled={plaque !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({
          ...current,
          plaque: enabled ? DEFAULT_PLAQUE : null,
        }))
      }
    >
      {plaque !== null && (
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
                update({
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
                onChange={(angleDeg) => update({ angleDeg })}
              />
            ) : (
              <Select
                label="Side"
                value={String(plaque.angleDeg)}
                options={sideOptions}
                onChange={(angle) => update({ angleDeg: Number(angle) })}
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
              onChange={(widthMm) => update({ widthMm })}
            />
            <NumberField
              label="Height"
              unit="mm"
              value={plaque.heightMm}
              min={1}
              step={0.2}
              onChange={(heightMm) => update({ heightMm })}
            />
            <NumberField
              label="Thickness"
              unit="mm"
              value={plaque.thicknessMm}
              min={0.2}
              max={2}
              step={0.1}
              onChange={(thicknessMm) => update({ thicknessMm })}
            />
            {plaque.style === 'plate' && (
              <NumberField
                label="Rivet height"
                unit="mm"
                value={plaque.rivetHeightMm}
                min={0.05}
                max={0.6}
                step={0.05}
                onChange={(rivetHeightMm) => update({ rivetHeightMm })}
              />
            )}
          </div>
          <label className="field">
            <span className="field-label">Plaque color (3MF export)</span>
            <input
              type="color"
              value={plaque.colorHex}
              onChange={(event) => update({ colorHex: event.target.value })}
            />
          </label>
          <p className="freeform-hint">
            A tablet on the side wall, with or without lettering. On round bases, put side
            lettering at the same position to write on the plaque; on straight-edged bases
            the plaque sits on one flat side.
          </p>
        </>
      )}
    </Section>
  );
}

interface LocalFontData {
  family: string;
  style: string;
  blob(): Promise<Blob>;
}

const BUILTIN_FONT_OPTIONS = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
];

export function LetteringPanel() {
  const lettering = useBaseParams().lettering;
  const localFontsRef = useRef<LocalFontData[]>([]);
  const [localFamilies, setLocalFamilies] = useState<string[] | null>(null);
  const [fontNotice, setFontNotice] = useState<string | null>(null);

  const browseSystemFonts = async () => {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFontData[]> })
      .queryLocalFonts;
    if (query === undefined) {
      setFontNotice('System fonts need a Chromium browser with the Local Font Access API.');
      return;
    }
    try {
      const fonts = await query.call(window);
      localFontsRef.current = fonts;
      setLocalFamilies([...new Set(fonts.map((font) => font.family))].sort());
      setFontNotice(null);
    } catch {
      setFontNotice('Access to system fonts was denied.');
    }
  };

  const pickSystemFont = async (family: string) => {
    const candidates = localFontsRef.current.filter((font) => font.family === family);
    const preferred = candidates.find((font) => /bold/i.test(font.style)) ?? candidates[0];
    if (preferred === undefined) {
      return;
    }
    try {
      const blob = await preferred.blob();
      await registerLetteringFont(family, await blob.arrayBuffer());
      update({ font: family });
      setFontNotice(null);
    } catch {
      setFontNotice('The selected font could not be loaded.');
    }
  };

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
                { value: 'engraved', label: 'Embedded (flush inlay)' },
                { value: 'embossed', label: 'Raised on top' },
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
              options={
                BUILTIN_FONT_OPTIONS.some((option) => option.value === lettering.font)
                  ? BUILTIN_FONT_OPTIONS
                  : [
                      ...BUILTIN_FONT_OPTIONS,
                      { value: lettering.font, label: `${lettering.font} (system)` },
                    ]
              }
              onChange={(font) => update({ font })}
            />
          </div>
          <div className="field-row">
            <button type="button" onClick={() => void browseSystemFonts()}>
              Browse system fonts
            </button>
            {localFamilies !== null && (
              <Select
                label="System font"
                value={localFamilies.includes(lettering.font) ? lettering.font : ''}
                options={[
                  { value: '', label: 'Pick a family...' },
                  ...localFamilies.map((family) => ({ value: family, label: family })),
                ]}
                onChange={(family) => {
                  if (family !== '') {
                    void pickSystemFont(family);
                  }
                }}
              />
            )}
          </div>
          {fontNotice !== null && <p className="freeform-hint">{fontNotice}</p>}
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
            Embedded letters sit flush in the surface; raised letters stand on it. Either way
            the letters export as their own colored part for multi-material printing.
          </p>
        </>
      )}
    </Section>
  );
}

