import type { SlottaParams } from '../../params/types.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Section } from './Section.tsx';

/**
 * Perpendicular offset that puts one long edge of the slot on the diagonal
 * through the base center, matching how real GW slotta bases place the
 * angled slot.
 */
function diagonalEdgeOffset(width: number, angleDeg: number): { offsetX: number; offsetY: number } {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    offsetX: Math.round((width / 2) * Math.sin(angle) * 100) / 100,
    offsetY: Math.round((-width / 2) * Math.cos(angle) * 100) / 100,
  };
}

const DEFAULT_SLOTTA: SlottaParams = {
  length: 26,
  width: 2,
  angleDeg: 45,
  ...diagonalEdgeOffset(2, 45),
};

export function SlottaPanel() {
  const slotta = useBaseParams().slotta;

  const update = (change: Partial<SlottaParams>) => {
    setBaseParams((current) => ({
      ...current,
      slotta: current.slotta === null ? null : { ...current.slotta, ...change },
    }));
  };

  return (
    <Section
      title="Slotta slot"
      enabled={slotta !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({ ...current, slotta: enabled ? DEFAULT_SLOTTA : null }))
      }
    >
      {slotta !== null && (
        <>
          <div className="field-row">
            <NumberField
              label="Length"
              unit="mm"
              value={slotta.length}
              min={2}
              step={1}
              onChange={(length) => update({ length })}
            />
            <NumberField
              label="Width"
              unit="mm"
              value={slotta.width}
              min={1}
              step={0.5}
              onChange={(width) => update({ width })}
            />
          </div>
          <div className="field-row">
            <NumberField
              label="Angle"
              unit="deg"
              value={slotta.angleDeg}
              step={5}
              onChange={(angleDeg) => update({ angleDeg })}
            />
            <NumberField
              label="Offset X"
              unit="mm"
              value={slotta.offsetX}
              step={0.5}
              onChange={(offsetX) => update({ offsetX })}
            />
            <NumberField
              label="Offset Y"
              unit="mm"
              value={slotta.offsetY}
              step={0.5}
              onChange={(offsetY) => update({ offsetY })}
            />
          </div>
          <button
            type="button"
            title="Places one long edge of the slot on the diagonal through the base center, like real GW slotta bases."
            onClick={() => update(diagonalEdgeOffset(slotta.width, slotta.angleDeg))}
          >
            Snap edge to center diagonal
          </button>
        </>
      )}
    </Section>
  );
}
