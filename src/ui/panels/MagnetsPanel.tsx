import type { MagnetParams } from '../../params/types.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

const DEFAULT_MAGNETS: MagnetParams = {
  shape: 'round',
  layout: 'even',
  diameter: 5,
  length: 5,
  width: 5,
  depth: 2,
  count: 1,
  spacing: 12,
  offsetX: 0,
  offsetY: 0,
  padding: 0.8,
};

export function MagnetsPanel() {
  const magnets = useBaseParams().magnets;

  const update = (change: Partial<MagnetParams>) => {
    setBaseParams((current) => ({
      ...current,
      magnets: current.magnets === null ? null : { ...current.magnets, ...change },
    }));
  };

  return (
    <Section
      title="Magnet slots"
      enabled={magnets !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({ ...current, magnets: enabled ? DEFAULT_MAGNETS : null }))
      }
    >
      {magnets !== null && (
        <>
          <Select
            label="Slot shape"
            value={magnets.shape}
            options={[
              { value: 'round', label: 'Round' },
              { value: 'rect', label: 'Rectangular' },
            ]}
            onChange={(shape) => update({ shape: shape as MagnetParams['shape'] })}
          />
          <Select
            label="Layout"
            value={magnets.layout}
            options={[
              { value: 'line', label: 'In a line' },
              { value: 'grid', label: 'Grid across the base' },
              { value: 'even', label: 'Equal areas (relaxed)' },
            ]}
            onChange={(layout) => update({ layout: layout as MagnetParams['layout'] })}
          />
          {magnets.shape === 'round' ? (
            <NumberField
              label="Diameter"
              unit="mm"
              value={magnets.diameter}
              min={1}
              step={0.5}
              onChange={(diameter) => update({ diameter })}
            />
          ) : (
            <div className="field-row">
              <NumberField
                label="Length"
                unit="mm"
                value={magnets.length}
                min={1}
                step={0.5}
                onChange={(length) => update({ length })}
              />
              <NumberField
                label="Width"
                unit="mm"
                value={magnets.width}
                min={1}
                step={0.5}
                onChange={(width) => update({ width })}
              />
            </div>
          )}
          <div className="field-row">
            <NumberField
              label="Depth"
              unit="mm"
              value={magnets.depth}
              min={0.5}
              step={0.25}
              onChange={(depth) => update({ depth })}
            />
            <NumberField
              label="Padding"
              unit="mm"
              value={magnets.padding}
              min={0}
              step={0.2}
              onChange={(padding) => update({ padding })}
            />
          </div>
          <div className="field-row">
            <NumberField
              label="Count"
              value={magnets.count}
              min={1}
              max={12}
              step={1}
              onChange={(count) => update({ count: Math.max(1, Math.round(count)) })}
            />
            {magnets.layout === 'line' && (
              <NumberField
                label="Spacing"
                unit="mm"
                value={magnets.spacing}
                min={1}
                step={1}
                onChange={(spacing) => update({ spacing })}
              />
            )}
          </div>
          {magnets.layout === 'line' && (
            <div className="field-row">
              <NumberField
                label="Offset X"
                unit="mm"
                value={magnets.offsetX}
                step={0.5}
                onChange={(offsetX) => update({ offsetX })}
              />
              <NumberField
                label="Offset Y"
                unit="mm"
                value={magnets.offsetY}
                step={0.5}
                onChange={(offsetY) => update({ offsetY })}
              />
            </div>
          )}
          {magnets.layout !== 'line' && (
            <p className="freeform-hint">
              Grid spreads the magnets over the footprint; equal areas relaxes
              them so each magnet anchors the same share of the base.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
