import { useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function NumberField({ label, value, onChange, min, max, step, unit }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (Number(text) !== value) {
      setText(String(value));
    }
  }

  const commit = (raw: string) => {
    setText(raw);
    const parsed = Number(raw);
    if (raw !== '' && Number.isFinite(parsed)) {
      onChange(parsed);
    }
  };

  return (
    <label className="field">
      <span className="field-label">
        {label}
        {unit !== undefined && <span className="field-unit">{unit}</span>}
      </span>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step ?? 0.5}
        onChange={(event) => commit(event.target.value)}
      />
    </label>
  );
}
