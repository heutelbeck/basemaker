import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Section } from './Section.tsx';

export function RecessPanel() {
  const recess = useBaseParams().recess;

  return (
    <Section
      title="Recessed top"
      enabled={recess !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({
          ...current,
          recess: enabled ? { depth: 1, inset: 1 } : null,
        }))
      }
    >
      {recess !== null && (
        <div className="field-row">
          <NumberField
            label="Depth"
            unit="mm"
            value={recess.depth}
            min={0.2}
            step={0.2}
            onChange={(depth) =>
              setBaseParams((current) => ({
                ...current,
                recess: current.recess === null ? null : { ...current.recess, depth },
              }))
            }
          />
          <NumberField
            label="Inset"
            unit="mm"
            value={recess.inset}
            min={0}
            step={0.25}
            onChange={(inset) =>
              setBaseParams((current) => ({
                ...current,
                recess: current.recess === null ? null : { ...current.recess, inset },
              }))
            }
          />
        </div>
      )}
    </Section>
  );
}
