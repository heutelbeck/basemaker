import type { BottleProfile, PaintRackParams } from '../../params/paintRack.ts';
import {
  VALLEJO_BOTTLE,
  planRacks,
  rackHoldsBottle,
  solvePaintRack,
} from '../../params/paintRack.ts';
import { useAppStore } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Section } from './Section.tsx';

export function PaintRackPanel() {
  const job = useAppStore((state) => state.job);
  const showMockParts = useAppStore((state) => state.showMockParts);
  const toggleMockParts = useAppStore((state) => state.toggleMockParts);
  if (job.generator !== 'paintRack') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<PaintRackParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'paintRack'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  const updateBottle = (change: Partial<BottleProfile>) =>
    update({ bottle: { ...params.bottle, ...change } });
  const layout = solvePaintRack(params);
  const racks = planRacks(params);
  const tilted = params.orientation === 'tilted';
  return (
    <>
      <Section title="Paint rack">
        {layout !== null && (
          <p className="freeform-hint">
            {layout.bottles.length} bottles in the drawer
            {tilted && `, tilted ${layout.tiltDeg.toFixed(1)} deg`}, highest bottle point{' '}
            {layout.totalHeight.toFixed(1)} mm above the drawer floor.
            {layout.frontOverhang > 0 &&
              ` Caps reach ${layout.frontOverhang.toFixed(1)} mm past the back of the grid.`}
          </p>
        )}
        {layout !== null && (
          <ul className="freeform-hint">
            {racks.map((rack) => (
              <li key={rack.label}>
                Rack {rack.label}: {rack.unitsX} x {rack.unitsY} units,{' '}
                {layout.bottles.filter((bottle) => rackHoldsBottle(rack, bottle)).length} bottles
              </li>
            ))}
          </ul>
        )}
        <Toggle label="Show bottles" checked={showMockParts} onChange={toggleMockParts} />
        <Select
          label="Arrangement"
          value={params.arrangement}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'staggered', label: 'Rows offset by half a bottle' },
          ]}
          onChange={(arrangement) =>
            update({ arrangement: arrangement as PaintRackParams['arrangement'] })
          }
        />
        <div className="field-row">
          <NumberField
            label="Drawer grid units wide"
            value={params.unitsX}
            min={1}
            max={24}
            step={1}
            onChange={(unitsX) => update({ unitsX: Math.round(unitsX) })}
          />
          <NumberField
            label="Drawer grid units deep"
            value={params.unitsY}
            min={1}
            max={24}
            step={1}
            onChange={(unitsY) => update({ unitsY: Math.round(unitsY) })}
          />
        </div>
        {tilted && (
          <Select
            label="Tilt from"
            value={params.tiltMode}
            options={[
              { value: 'maxHeight', label: 'Maximum height (steepest that fits)' },
              { value: 'angle', label: 'Fixed angle' },
            ]}
            onChange={(tiltMode) => update({ tiltMode: tiltMode as PaintRackParams['tiltMode'] })}
          />
        )}
        {tilted && params.tiltMode === 'maxHeight' && (
          <NumberField
            label="Maximum height above drawer floor"
            unit="mm"
            value={params.maxHeightMm}
            min={20}
            step={1}
            onChange={(maxHeightMm) => update({ maxHeightMm })}
          />
        )}
        {tilted && params.tiltMode === 'angle' && (
          <NumberField
            label="Tilt"
            unit="deg"
            value={params.tiltDeg}
            min={5}
            max={89.5}
            step={1}
            onChange={(tiltDeg) => update({ tiltDeg })}
          />
        )}
        {!tilted && (
          <NumberField
            label="Pocket depth"
            unit="mm"
            value={params.uprightDepthMm}
            min={3}
            max={60}
            step={1}
            onChange={(uprightDepthMm) => update({ uprightDepthMm })}
          />
        )}
        {tilted && (
          <NumberField
            label={
              params.fill === 'filled' || params.fill === 'block'
                ? 'Top height: support length along the bottle'
                : 'Support length along the bottle'
            }
            unit="mm"
            value={params.supportLengthMm}
            min={10}
            step={1}
            onChange={(supportLengthMm) => update({ supportLengthMm })}
          />
        )}
        <div className="field-row">
          <NumberField
            label="Wall"
            unit="mm"
            value={params.wallMm}
            min={0.4}
            step={0.1}
            onChange={(wallMm) => update({ wallMm })}
          />
          <NumberField
            label="Gap between bottles"
            unit="mm"
            value={params.bottleGapMm}
            min={-params.clearanceMm}
            step={0.1}
            onChange={(bottleGapMm) => update({ bottleGapMm })}
          />
          <NumberField
            label="Floor"
            unit="mm"
            value={params.floorMm}
            min={0.8}
            step={0.1}
            onChange={(floorMm) => update({ floorMm })}
          />
        </div>
        {tilted && (
          <Toggle
            label="Modules in a row: one bottle row per grid unit, caps reach over the next module"
            checked={params.tileModules}
            onChange={(tileModules) => update({ tileModules })}
          />
        )}
        {tilted && !params.tileModules && (
          <NumberField
            label="Free room behind the grid for caps"
            unit="mm"
            value={params.frontRoomMm}
            min={0}
            step={1}
            onChange={(frontRoomMm) => update({ frontRoomMm })}
          />
        )}
        <Toggle
          label="Leave out grid rows without support"
          checked={params.trimEmptyRows}
          onChange={(trimEmptyRows) => update({ trimEmptyRows })}
        />
        <Select
          label="Bottles"
          value={params.orientation}
          options={[
            { value: 'tilted', label: 'Lying tilted (low drawers)' },
            { value: 'upright', label: 'Standing upright' },
          ]}
          onChange={(orientation) =>
            update({ orientation: orientation as PaintRackParams['orientation'] })
          }
        />
        <Toggle
          label="Gridfinity foot"
          checked={params.gridfinity}
          onChange={(gridfinity) => update({ gridfinity })}
        />
        {params.gridfinity && (
          <NumberField
            label="Baseplate height"
            unit="mm"
            value={params.baseplateHeightMm}
            min={0}
            step={0.5}
            onChange={(baseplateHeightMm) => update({ baseplateHeightMm })}
          />
        )}
        <div className="field-row">
          <NumberField
            label="Build plate width"
            unit="mm"
            value={params.plateWidthMm}
            min={42}
            step={1}
            onChange={(plateWidthMm) => update({ plateWidthMm })}
          />
          <NumberField
            label="Build plate depth"
            unit="mm"
            value={params.plateDepthMm}
            min={42}
            step={1}
            onChange={(plateDepthMm) => update({ plateDepthMm })}
          />
        </div>
        <p className="freeform-hint">
          Caps rise towards the back of the drawer, labels face the front. On Gridfinity feet the
          bottles sink into the foot cells and pass the baseplate ridges with no material in
          between; the baseplate height counts towards the maximum height.
        </p>
      </Section>
      <Section title="Bottle">
        <div className="quality-presets">
          <button
            type="button"
            className="chip"
            onClick={() => update({ bottle: { ...VALLEJO_BOTTLE } })}
          >
            Vallejo / AK 17 ml
          </button>
        </div>
        <div className="field-row">
          <NumberField
            label="Body diameter"
            unit="mm"
            value={params.bottle.bodyDiameterMm}
            min={5}
            step={0.1}
            onChange={(bodyDiameterMm) => updateBottle({ bodyDiameterMm })}
          />
          <NumberField
            label="Body length"
            unit="mm"
            value={params.bottle.bodyLengthMm}
            min={5}
            step={0.5}
            onChange={(bodyLengthMm) => updateBottle({ bodyLengthMm })}
          />
        </div>
        <div className="field-row">
          <NumberField
            label="Neck diameter"
            unit="mm"
            value={params.bottle.neckDiameterMm}
            min={3}
            step={0.1}
            onChange={(neckDiameterMm) => updateBottle({ neckDiameterMm })}
          />
          <NumberField
            label="Top diameter"
            unit="mm"
            value={params.bottle.topDiameterMm}
            min={3}
            step={0.1}
            onChange={(topDiameterMm) => updateBottle({ topDiameterMm })}
          />
        </div>
        <div className="field-row">
          <NumberField
            label="Total length"
            unit="mm"
            value={params.bottle.lengthMm}
            min={10}
            step={0.5}
            onChange={(lengthMm) => updateBottle({ lengthMm })}
          />
          <NumberField
            label="Clearance"
            unit="mm"
            value={params.clearanceMm}
            min={0}
            max={3}
            step={0.1}
            onChange={(clearanceMm) => update({ clearanceMm })}
          />
        </div>
      </Section>
    </>
  );
}
