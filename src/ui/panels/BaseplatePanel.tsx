import type { BaseplateAlign, BaseplateParams } from '../../params/baseplate.ts';
import { baseplatePrintKey, planBaseplate, planBaseplateAxes } from '../../params/baseplate.ts';
import { useAppStore } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Section } from './Section.tsx';

export function BaseplatePanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'baseplate') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<BaseplateParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'baseplate'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  const { x, y } = planBaseplateAxes(params);
  const pieces = planBaseplate(params);
  const prints = new Map<string, { label: string; size: string; count: number }>();
  for (const piece of pieces ?? []) {
    const key = baseplatePrintKey(piece);
    const entry = prints.get(key);
    if (entry === undefined) {
      prints.set(key, {
        label: piece.label,
        size: `${piece.width.toFixed(1)} x ${piece.depth.toFixed(1)} mm`,
        count: 1,
      });
    } else {
      entry.count += 1;
    }
  }
  const alignOptions = (start: string, end: string) => [
    { value: 'center', label: 'Centered, filler on both sides' },
    { value: 'start', label: `Against the ${start} wall` },
    { value: 'end', label: `Against the ${end} wall` },
  ];
  return (
    <Section title="Gridfinity baseplate">
      {pieces !== null && (
        <>
          <p className="freeform-hint">
            {x.units} x {y.units} units in {pieces.length} parts. Filler seen from the front: left{' '}
            {x.padStart.toFixed(1)}, right {x.padEnd.toFixed(1)}, front {y.padStart.toFixed(1)},
            back {y.padEnd.toFixed(1)} mm.
          </p>
          <ul className="freeform-hint">
            {[...prints.values()].map((print) => (
              <li key={print.label}>
                Part {print.label}: {print.size}, print {print.count}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="field-row">
        <NumberField
          label="Drawer inside width"
          unit="mm"
          value={params.drawerWidthMm}
          min={42}
          step={0.5}
          onChange={(drawerWidthMm) => update({ drawerWidthMm })}
        />
        <NumberField
          label="Drawer inside depth"
          unit="mm"
          value={params.drawerDepthMm}
          min={42}
          step={0.5}
          onChange={(drawerDepthMm) => update({ drawerDepthMm })}
        />
      </div>
      <Select
        label="Grid across the drawer"
        value={params.alignX}
        options={alignOptions('left', 'right')}
        onChange={(alignX) => update({ alignX: alignX as BaseplateAlign })}
      />
      <Select
        label="Grid along the drawer depth"
        value={params.alignY}
        options={alignOptions('front', 'back')}
        onChange={(alignY) => update({ alignY: alignY as BaseplateAlign })}
      />
      <NumberField
        label="Play to the drawer walls (total per axis)"
        unit="mm"
        value={params.clearanceMm}
        min={0}
        max={10}
        step={0.1}
        onChange={(clearanceMm) => update({ clearanceMm })}
      />
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
      <Toggle
        label="Solid filler at the drawer walls instead of bars"
        checked={params.solidFiller}
        onChange={(solidFiller) => update({ solidFiller })}
      />
      <Toggle
        label="Holes across the seams for filament connectors"
        checked={params.connectorHoles}
        onChange={(connectorHoles) => update({ connectorHoles })}
      />
      {params.connectorHoles && (
        <Toggle
          label="Connector holes on the outer edges too, to join parts later"
          checked={params.connectorHolesOnEdges}
          onChange={(connectorHolesOnEdges) => update({ connectorHolesOnEdges })}
        />
      )}
      {params.connectorHoles && (
        <NumberField
          label="Connector hole diameter"
          unit="mm"
          value={params.connectorHoleMm}
          min={1}
          step={0.05}
          onChange={(connectorHoleMm) => update({ connectorHoleMm })}
        />
      )}
      <Toggle
        label="Star holes in the crossings, for nails or glue"
        checked={params.starHoles}
        onChange={(starHoles) => update({ starHoles })}
      />
      <NumberField
        label="Drawer corner radius (0 = square)"
        unit="mm"
        value={params.cornerRadiusMm}
        min={0}
        max={30}
        step={0.5}
        onChange={(cornerRadiusMm) => update({ cornerRadiusMm })}
      />
      <div className="field-row">
        <NumberField
          label="Bar width"
          unit="mm"
          value={params.barWidthMm}
          min={0.4}
          max={5}
          step={0.1}
          onChange={(barWidthMm) => update({ barWidthMm })}
        />
        <NumberField
          label="Bar height"
          unit="mm"
          value={params.barHeightMm}
          min={0.4}
          step={0.1}
          onChange={(barHeightMm) => update({ barHeightMm })}
        />
      </div>
      <NumberField
        label="Profile reach from each crossing (21 = full profile)"
        unit="mm"
        value={params.nodeArmMm}
        min={4}
        max={21}
        step={0.5}
        onChange={(nodeArmMm) => update({ nodeArmMm })}
      />
      <p className="freeform-hint">
        Push a piece of 1.75 mm filament through each seam hole from the open cell into the
        neighboring part and trim it flush. Parts that match after a half turn are one print.
      </p>
    </Section>
  );
}
