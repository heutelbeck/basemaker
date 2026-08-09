import type { SurfaceParams } from '../../params/surface.ts';
import { clampSurfaceDepths, defaultSurfaceParams } from '../../params/surface.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Section } from './Section.tsx';

export function SurfacePanel() {
  const surface = useBaseParams().surface;

  const update = (change: Partial<SurfaceParams>) => {
    setBaseParams((current) => ({
      ...current,
      surface:
        current.surface === null
          ? null
          : ({ ...current.surface, ...change } as SurfaceParams),
    }));
  };

  const reroll = () => {
    update({ seed: Math.floor(Math.random() * 1_000_000) + 1 });
  };

  return (
    <Section
      title="Surface texture"
      enabled={surface !== null}
      onToggle={(enabled) =>
        setBaseParams((current) => ({
          ...current,
          surface: enabled
            ? clampSurfaceDepths(
                defaultSurfaceParams('cobblestone'),
                current.hollow !== null ? current.hollow.topThickness : current.height,
              )
            : null,
        }))
      }
    >
      {surface !== null && (
        <>
          <Select
            label="Texture"
            value={surface.type}
            options={[
              { value: 'cobblestone', label: 'Cobblestone' },
              { value: 'planks', label: 'Wood planks' },
              { value: 'pond', label: 'Ponds' },
              { value: 'craters', label: 'Impact craters' },
              { value: 'lava', label: 'Cracked earth' },
              { value: 'steelPlates', label: 'Steel deck plates' },
            ]}
            onChange={(type) =>
              setBaseParams((current) => ({
                ...current,
                surface: clampSurfaceDepths(
                  defaultSurfaceParams(type as SurfaceParams['type']),
                  current.hollow !== null ? current.hollow.topThickness : current.height,
                ),
              }))
            }
          />
          {surface.type === 'cobblestone' && (
            <>
              <Select
                label="Pattern"
                value={surface.pattern}
                options={[
                  { value: 'random', label: 'Random' },
                  { value: 'coursed', label: 'Coursed rows' },
                  { value: 'fan', label: 'Fan rings' },
                ]}
                onChange={(pattern) => update({ pattern } as Partial<SurfaceParams>)}
              />
              <div className="field-row">
                <NumberField
                  label="Stone size"
                  unit="mm"
                  value={surface.stoneSize}
                  min={2}
                  step={0.5}
                  onChange={(stoneSize) => update({ stoneSize })}
                />
                <NumberField
                  label="Gap"
                  unit="mm"
                  value={surface.gap}
                  min={0.1}
                  step={0.05}
                  onChange={(gap) => update({ gap })}
                />
                <NumberField
                  label="Relief"
                  unit="mm"
                  value={surface.reliefHeight}
                  min={0.2}
                  step={0.1}
                  onChange={(reliefHeight) => update({ reliefHeight })}
                />
              </div>
              <Toggle
                label="Domed stone tops (best on resin printers)"
                checked={surface.domed}
                onChange={(domed) => update({ domed })}
              />
            </>
          )}
          {surface.type === 'planks' && (
            <>
            <div className="field-row">
              <NumberField
                label="Plank width"
                unit="mm"
                value={surface.plankWidth}
                min={2}
                step={0.5}
                onChange={(plankWidth) => update({ plankWidth })}
              />
              <NumberField
                label="Gap"
                unit="mm"
                value={surface.gap}
                min={0.2}
                step={0.1}
                onChange={(gap) => update({ gap })}
              />
              <NumberField
                label="Relief"
                unit="mm"
                value={surface.reliefHeight}
                min={0.2}
                step={0.1}
                onChange={(reliefHeight) => update({ reliefHeight })}
              />
              <NumberField
                label="Angle"
                unit="deg"
                value={surface.angleDeg}
                step={15}
                onChange={(angleDeg) => update({ angleDeg })}
              />
            </div>
            <Toggle
              label="Engraved wood grain"
              checked={surface.grain}
              onChange={(grain) => update({ grain })}
            />
            </>
          )}
          {surface.type === 'pond' && (
            <>
              <div className="field-row">
                <NumberField
                  label="Count"
                  value={surface.count}
                  min={1}
                  max={4}
                  step={1}
                  onChange={(count) => update({ count: Math.max(1, Math.round(count)) })}
                />
                <NumberField
                  label="Depth"
                  unit="mm"
                  value={surface.depth}
                  min={0.2}
                  step={0.1}
                  onChange={(depth) => update({ depth })}
                />
                <NumberField
                  label="Size"
                  value={surface.sizeFraction}
                  min={0.2}
                  max={0.7}
                  step={0.05}
                  onChange={(sizeFraction) => update({ sizeFraction })}
                />
                <NumberField
                  label="Roughness"
                  value={surface.roughness}
                  min={0}
                  max={0.6}
                  step={0.05}
                  onChange={(roughness) => update({ roughness })}
                />
              </div>
              <Toggle
                label="Graded shore from shallow to deep"
                checked={surface.shoreGradient}
                onChange={(shoreGradient) => update({ shoreGradient })}
              />
            </>
          )}
          {surface.type === 'craters' && (
            <div className="field-row">
              <NumberField
                label="Count"
                value={surface.count}
                min={1}
                max={4}
                step={1}
                onChange={(count) => update({ count: Math.max(1, Math.round(count)) })}
              />
              <NumberField
                label="Diameter"
                unit="mm"
                value={surface.diameterMm}
                min={4}
                step={1}
                onChange={(diameterMm) => update({ diameterMm })}
              />
              <NumberField
                label="Depth"
                unit="mm"
                value={surface.depth}
                min={0.2}
                step={0.1}
                onChange={(depth) => update({ depth })}
              />
              <NumberField
                label="Rim height"
                unit="mm"
                value={surface.rimHeight}
                min={0}
                step={0.1}
                onChange={(rimHeight) => update({ rimHeight })}
              />
            </div>
          )}
          {surface.type === 'lava' && (
            <div className="field-row">
              <NumberField
                label="Plate size"
                unit="mm"
                value={surface.cellSize}
                min={3}
                step={0.5}
                onChange={(cellSize) => update({ cellSize })}
              />
              <NumberField
                label="Crack width"
                unit="mm"
                value={surface.crackWidth}
                min={0.4}
                step={0.1}
                onChange={(crackWidth) => update({ crackWidth })}
              />
              <NumberField
                label="Depth"
                unit="mm"
                value={surface.depth}
                min={0.2}
                step={0.1}
                onChange={(depth) => update({ depth })}
              />
            </div>
          )}
          {surface.type === 'steelPlates' && (
            <>
              <Select
                label="Detail"
                value={surface.detail}
                options={[
                  { value: 'rivets', label: 'Rivet rows' },
                  { value: 'tread', label: 'Anti-slip tread bars' },
                  { value: 'diamond', label: 'Checker plate diamonds' },
                  { value: 'plain', label: 'Plain plates' },
                ]}
                onChange={(detail) => update({ detail } as Partial<SurfaceParams>)}
              />
              <div className="field-row">
                <NumberField
                  label="Plate size"
                  unit="mm"
                  value={surface.plateSize}
                  min={6}
                  step={1}
                  onChange={(plateSize) => update({ plateSize })}
                />
                <NumberField
                  label="Seam"
                  unit="mm"
                  value={surface.gap}
                  min={0.2}
                  step={0.1}
                  onChange={(gap) => update({ gap })}
                />
                <NumberField
                  label="Relief"
                  unit="mm"
                  value={surface.reliefHeight}
                  min={0.2}
                  step={0.1}
                  onChange={(reliefHeight) => update({ reliefHeight })}
                />
                <NumberField
                  label="Detail height"
                  unit="mm"
                  value={surface.detailHeight}
                  min={0.1}
                  step={0.05}
                  onChange={(detailHeight) => update({ detailHeight })}
                />
              </div>
            </>
          )}
          <button type="button" onClick={reroll}>
            Reroll variation (seed {surface.seed})
          </button>
        </>
      )}
    </Section>
  );
}
