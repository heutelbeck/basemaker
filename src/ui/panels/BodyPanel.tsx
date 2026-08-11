import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

export function BodyPanel() {
  const params = useBaseParams();

  return (
    <Section title="Body">
      <div className="field-row">
        <NumberField
          label="Height"
          unit="mm"
          value={params.height}
          min={1}
          step={0.5}
          onChange={(height) => setBaseParams((current) => ({ ...current, height }))}
        />
        <NumberField
          label="Edge slope"
          unit="mm"
          value={params.edgeSlope}
          min={0}
          step={0.25}
          onChange={(edgeSlope) => setBaseParams((current) => ({ ...current, edgeSlope }))}
        />
        <NumberField
          label="Lip radius"
          unit="mm"
          value={params.lipRadius}
          min={0}
          step={0.25}
          onChange={(lipRadius) => setBaseParams((current) => ({ ...current, lipRadius }))}
        />
        {params.lipRadius > params.height && (
          <NumberField
            label="Lip top roll"
            unit="mm"
            value={params.lipTopRadius}
            min={0}
            step={0.1}
            onChange={(lipTopRadius) => setBaseParams((current) => ({ ...current, lipTopRadius }))}
          />
        )}
      </div>
      {params.lipRadius > params.height && (
        <p className="freeform-hint">
          A lip radius larger than the height turns the whole side into one truncated arc
          (Warmachine style); the top roll blends that arc into the top face with a smaller
          tangent arc instead of a hard corner.
        </p>
      )}
      <Section
        title="Hollow underside"
        enabled={params.hollow !== null}
        onToggle={(enabled) =>
          setBaseParams((current) => ({
            ...current,
            hollow: enabled ? { wall: 1.1, topThickness: 1, supports: null } : null,
          }))
        }
      >
        {params.hollow !== null && (
          <>
            <div className="field-row">
              <NumberField
                label="Wall"
                unit="mm"
                value={params.hollow.wall}
                min={0.5}
                step={0.25}
                onChange={(wall) =>
                  setBaseParams((current) => ({
                    ...current,
                    hollow: current.hollow === null ? null : { ...current.hollow, wall },
                  }))
                }
              />
              <NumberField
                label="Top thickness"
                unit="mm"
                value={params.hollow.topThickness}
                min={0.4}
                step={0.2}
                onChange={(topThickness) =>
                  setBaseParams((current) => ({
                    ...current,
                    hollow: current.hollow === null ? null : { ...current.hollow, topThickness },
                  }))
                }
              />
            </div>
            <Section
              title="Support pillars"
              enabled={params.hollow.supports !== null}
              onToggle={(enabled) =>
                setBaseParams((current) => ({
                  ...current,
                  hollow:
                    current.hollow === null
                      ? null
                      : {
                          ...current.hollow,
                          supports: enabled ? { style: 'pillars' as const, spacing: 15, diameter: 3 } : null,
                        },
                }))
              }
            >
              {params.hollow.supports !== null && (
                <>
                  <Select
                    label="Style"
                    value={params.hollow.supports.style}
                    options={[
                      { value: 'pillars', label: 'Round pillars' },
                      { value: 'grid', label: 'Rib grid (faster to print)' },
                    ]}
                    onChange={(style) =>
                      setBaseParams((current) => ({
                        ...current,
                        hollow:
                          current.hollow === null || current.hollow.supports === null
                            ? current.hollow
                            : {
                                ...current.hollow,
                                supports: {
                                  ...current.hollow.supports,
                                  style: style as 'pillars' | 'grid',
                                },
                              },
                      }))
                    }
                  />
                  <div className="field-row">
                    <NumberField
                      label="Spacing"
                      unit="mm"
                      value={params.hollow.supports.spacing}
                      min={5}
                      step={1}
                      onChange={(spacing) =>
                        setBaseParams((current) => ({
                          ...current,
                          hollow:
                            current.hollow === null || current.hollow.supports === null
                              ? current.hollow
                              : {
                                  ...current.hollow,
                                  supports: { ...current.hollow.supports, spacing },
                                },
                        }))
                      }
                    />
                    <NumberField
                      label={params.hollow.supports.style === 'grid' ? 'Rib thickness' : 'Diameter'}
                      unit="mm"
                      value={params.hollow.supports.diameter}
                      min={0.8}
                      step={0.2}
                      onChange={(diameter) =>
                        setBaseParams((current) => ({
                          ...current,
                          hollow:
                            current.hollow === null || current.hollow.supports === null
                              ? current.hollow
                              : {
                                  ...current.hollow,
                                  supports: { ...current.hollow.supports, diameter },
                                },
                        }))
                      }
                    />
                  </div>
                  <p className="freeform-hint">
                    A centered grid of pillars keeps the top plate of larger bases stiff. Pillars
                    stay clear of the hollow rim and of magnet and slot holders, which already act
                    as supports.
                  </p>
                </>
              )}
            </Section>
          </>
        )}
      </Section>
    </Section>
  );
}
