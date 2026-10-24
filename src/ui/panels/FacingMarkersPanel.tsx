import type { FacingMarkerSpec, FacingMarkerStyle } from '../../params/facingMarkers.ts';
import {
  FACING_MARKER_STYLE_LABELS,
  defaultFacingMarker,
  frontArcMarkers,
} from '../../params/facingMarkers.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

const STYLE_OPTIONS = (Object.keys(FACING_MARKER_STYLE_LABELS) as FacingMarkerStyle[]).map(
  (style) => ({ value: style, label: FACING_MARKER_STYLE_LABELS[style] }),
);

/**
 * Direction marks engraved into the side wall for games with firing or
 * line-of-fire arcs. All marks are indentations so the outer footprint
 * stays exact for edge-to-edge measuring. Angles are absolute: 0 degrees
 * points right (+X), 90 degrees up (+Y), counterclockwise positive.
 */
export function FacingMarkersPanel() {
  const facing = useBaseParams().facingMarkers;

  const update = (change: Partial<{ depth: number; markers: FacingMarkerSpec[] }>) => {
    setBaseParams((current) => ({
      ...current,
      facingMarkers:
        current.facingMarkers === null ? null : { ...current.facingMarkers, ...change },
    }));
  };

  const updateMarker = (index: number, change: Partial<FacingMarkerSpec>) => {
    if (facing === null) {
      return;
    }
    update({
      markers: facing.markers.map((marker, i) => (i === index ? { ...marker, ...change } : marker)),
    });
  };

  return (
    <Section
      title="Facing markers"
      enabled={facing !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({
          ...current,
          facingMarkers: enabled ? frontArcMarkers() : null,
        }))
      }
    >
      {facing !== null && (
        <>
          <NumberField
            label="Engraving depth"
            unit="mm"
            value={facing.depth}
            min={0.1}
            step={0.1}
            onChange={(depth) => update({ depth })}
          />
          {facing.markers.map((marker, index) => (
            <div className="item-group" key={index}>
              <div className="item-group-head">
                <span className="item-group-title">Marker {index + 1}</span>
                <button
                  type="button"
                  title="Remove this marker."
                  onClick={() => update({ markers: facing.markers.filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </div>
              <div className="field-row">
                <Select
                  label="Style"
                  value={marker.style}
                  options={STYLE_OPTIONS}
                  onChange={(style) => updateMarker(index, { style: style as FacingMarkerStyle })}
                />
                <NumberField
                  label="Angle"
                  unit="deg"
                  value={marker.angleDeg}
                  step={5}
                  onChange={(angleDeg) => updateMarker(index, { angleDeg })}
                />
              </div>
              <div className="field-row">
                {marker.style !== 'line' && (
                  <NumberField
                    label="Width"
                    unit="mm"
                    value={marker.widthMm}
                    min={0.2}
                    step={0.5}
                    onChange={(widthMm) => updateMarker(index, { widthMm })}
                  />
                )}
                {marker.style !== 'triangleUp' && marker.style !== 'triangleDown' && (
                  <NumberField
                    label="Line width"
                    unit="mm"
                    value={marker.lineWidthMm}
                    min={0.2}
                    step={0.1}
                    onChange={(lineWidthMm) => updateMarker(index, { lineWidthMm })}
                  />
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            title="Add another marker."
            onClick={() => update({ markers: [...facing.markers, defaultFacingMarker()] })}
          >
            + Add marker
          </button>
        </>
      )}
    </Section>
  );
}
