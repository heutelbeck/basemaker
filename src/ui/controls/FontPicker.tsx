import { useRef, useState } from 'react';
import { registerLetteringFont } from '../../state/store.ts';
import { Select } from './Select.tsx';

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

/**
 * Font face selection with the bundled faces plus any locally installed
 * system font via the Local Font Access API (Chromium). Picking a system
 * family registers its bytes for the geometry worker before reporting
 * the face name through onChange.
 */
export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (face: string) => void;
}) {
  const localFontsRef = useRef<LocalFontData[]>([]);
  const [localFamilies, setLocalFamilies] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const browseSystemFonts = async () => {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFontData[]> })
      .queryLocalFonts;
    if (query === undefined) {
      setNotice('System fonts need a Chromium browser with the Local Font Access API.');
      return;
    }
    try {
      const fonts = await query.call(window);
      localFontsRef.current = fonts;
      setLocalFamilies([...new Set(fonts.map((font) => font.family))].sort());
      setNotice(null);
    } catch {
      setNotice('Access to system fonts was denied.');
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
      onChange(family);
      setNotice(null);
    } catch {
      setNotice('The selected font could not be loaded.');
    }
  };

  return (
    <>
      <div className="field-row">
        <Select
          label="Font"
          value={value}
          options={
            BUILTIN_FONT_OPTIONS.some((option) => option.value === value)
              ? BUILTIN_FONT_OPTIONS
              : [...BUILTIN_FONT_OPTIONS, { value, label: `${value} (system)` }]
          }
          onChange={onChange}
        />
        <button type="button" onClick={() => void browseSystemFonts()}>
          Browse system fonts
        </button>
        {localFamilies !== null && (
          <Select
            label="System font"
            value={localFamilies.includes(value) ? value : ''}
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
      {notice !== null && <p className="freeform-hint">{notice}</p>}
    </>
  );
}
