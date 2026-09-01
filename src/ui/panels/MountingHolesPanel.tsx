import type { MountingHoleShape, MountingHoleSpec } from '../../params/mountingHoles.ts';
import { defaultMountingHole, gwHexPegHole } from '../../params/mountingHoles.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

const SHAPE_OPTIONS: { value: MountingHoleShape; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'hex', label: 'Hex' },
];

/**
 * Vertical through-holes with a structural tube down to the bottom rim,
 * like the peg holes of recent GW push-fit bases. Hex holes are measured
 * across flats and can be rotated for keyed pegs.
 */
export function MountingHolesPanel() {
  const mounting = useBaseParams().mountingHoles;

  const updateHoles = (holes: MountingHoleSpec[]) => {
    setBaseParams((current) => ({
      ...current,
      mountingHoles: current.mountingHoles === null ? null : { holes },
    }));
  };

  const updateHole = (index: number, change: Partial<MountingHoleSpec>) => {
    if (mounting === null) {
      return;
    }
    updateHoles(mounting.holes.map((hole, i) => (i === index ? { ...hole, ...change } : hole)));
  };

  return (
    <Section
      title="Mounting holes"
      enabled={mounting !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({
          ...current,
          mountingHoles: enabled ? gwHexPegHole() : null,
        }))
      }
    >
      {mounting !== null && (
        <>
          {mounting.holes.map((hole, index) => (
            <div className="item-group" key={index}>
              <div className="item-group-head">
                <span className="item-group-title">Hole {index + 1}</span>
                <button
                  type="button"
                  title="Remove this hole."
                  onClick={() => updateHoles(mounting.holes.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
              <div className="field-row">
                <Select
                  label="Shape"
                  value={hole.shape}
                  options={SHAPE_OPTIONS}
                  onChange={(shape) => updateHole(index, { shape: shape as MountingHoleShape })}
                />
                <NumberField
                  label={hole.shape === 'hex' ? 'Across flats' : 'Diameter'}
                  unit="mm"
                  value={hole.sizeMm}
                  min={0.5}
                  step={0.5}
                  onChange={(sizeMm) => updateHole(index, { sizeMm })}
                />
                <NumberField
                  label="Rim"
                  unit="mm"
                  value={hole.rimMm}
                  min={0.8}
                  step={0.1}
                  onChange={(rimMm) => updateHole(index, { rimMm })}
                />
              </div>
              <div className="field-row">
                <NumberField
                  label="X"
                  unit="mm"
                  value={hole.offsetX}
                  step={0.5}
                  onChange={(offsetX) => updateHole(index, { offsetX })}
                />
                <NumberField
                  label="Y"
                  unit="mm"
                  value={hole.offsetY}
                  step={0.5}
                  onChange={(offsetY) => updateHole(index, { offsetY })}
                />
                {hole.shape === 'hex' && (
                  <NumberField
                    label="Rotation"
                    unit="deg"
                    value={hole.rotationDeg}
                    step={5}
                    onChange={(rotationDeg) => updateHole(index, { rotationDeg })}
                  />
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            title="Add another mounting hole."
            onClick={() => updateHoles([...mounting.holes, defaultMountingHole()])}
          >
            + Add hole
          </button>
        </>
      )}
    </Section>
  );
}
