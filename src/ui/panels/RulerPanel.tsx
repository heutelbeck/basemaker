import type { RulerParams } from '../../params/ruler.ts';
import { useAppStore } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Section } from './Section.tsx';

export function RulerPanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'ruler') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<RulerParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'ruler'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  return (
    <Section title="Measuring ruler">
      <Select
        label="Variant"
        value={params.variant}
        options={[
          { value: 'stick', label: 'Rigid stick (numbered cells)' },
          { value: 'chain', label: 'Flexible chain (numbered links)' },
        ]}
        onChange={(variant) =>
          update({
            variant: variant as RulerParams['variant'],
            thicknessMm: variant === 'stick' ? 2.4 : 4,
          })
        }
      />
      {params.variant === 'chain' && (
        <Select
          label="Pivots per joint"
          value={String(params.pivotsPerJoint)}
          options={[
            { value: '1', label: '1 (integrated tail, practical)' },
            { value: '2', label: '2 (separate straps, extra flexible)' },
          ]}
          onChange={(pivots) =>
            update({ pivotsPerJoint: Number(pivots) as RulerParams['pivotsPerJoint'] })
          }
        />
      )}
      {params.variant === 'chain' && (
        <Select
          label="Link connector"
          value={params.connector}
          options={[
            { value: 'pin', label: 'Press-fit snap rivets' },
            { value: 'magnet', label: 'Magnet pockets' },
          ]}
          onChange={(connector) =>
            update({
              connector: connector as RulerParams['connector'],
              thicknessMm: 4,
              magnetDiameterMm: 4,
              magnetHeightMm: 1,
            })
          }
        />
      )}
      <div className="field-row">
        <NumberField
          label="Unit length"
          unit="mm"
          value={params.unitLengthMm}
          min={5}
          step={0.1}
          onChange={(unitLengthMm) => update({ unitLengthMm })}
        />
        <NumberField
          label="Units"
          value={params.units}
          min={1}
          max={20}
          step={1}
          onChange={(units) => update({ units: Math.max(1, Math.round(units)) })}
        />
      </div>
      <div className="field-row">
        <NumberField
          label="Width"
          unit="mm"
          value={params.widthMm}
          min={6}
          max={30}
          step={0.5}
          onChange={(widthMm) => update({ widthMm })}
        />
        <NumberField
          label="Thickness"
          unit="mm"
          value={params.thicknessMm}
          min={1.6}
          max={6}
          step={0.2}
          onChange={(thicknessMm) => update({ thicknessMm })}
        />
        {params.variant === 'stick' && (
          <NumberField
            label="Split every (units, 0 = off)"
            value={params.splitEveryUnits}
            min={0}
            step={1}
            onChange={(splitEveryUnits) =>
              update({ splitEveryUnits: Math.max(0, Math.round(splitEveryUnits)) })
            }
          />
        )}
      </div>
      {params.variant === 'chain' && params.connector === 'magnet' && (
        <div className="field-row">
          <NumberField
            label="Magnet diameter"
            unit="mm"
            value={params.magnetDiameterMm}
            min={2}
            step={0.5}
            onChange={(magnetDiameterMm) => update({ magnetDiameterMm })}
          />
          <NumberField
            label="Magnet depth"
            unit="mm"
            value={params.magnetHeightMm}
            min={0.5}
            step={0.5}
            onChange={(magnetHeightMm) => update({ magnetHeightMm })}
          />
        </div>
      )}
      <Toggle
        label="Rotate numbers along the ruler (two digits fit narrow rulers)"
        checked={params.rotateNumbers}
        onChange={(rotateNumbers) => update({ rotateNumbers })}
      />
      <label className="field">
        <span className="field-label">Accent color (3MF export)</span>
        <input
          type="color"
          value={params.accentColorHex}
          onChange={(event) => update({ accentColorHex: event.target.value })}
        />
      </label>
      <p className="freeform-hint">
        Sticks carry a colored frame, dividers, and numbers as a flush top inlay; set a split
        length to break long sticks into dovetailed pieces for gluing (25.4 mm units equal one
        inch), loaded as separately arrangeable objects. Chain links print separately and are
        assembled: each numbered pill measures exactly one unit, and its integrated tail (or
        separate straps with two pivots) slides under the next pill. Pin joints are press-fit
        snap rivets - push the chamfered cap through the hole until it seats flush - and the
        magnet option puts vertical pockets at the same pivots instead.
      </p>
    </Section>
  );
}
