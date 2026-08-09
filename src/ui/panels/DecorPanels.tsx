import type { CrystalParams, PlantParams, RockParams } from '../../params/decor.ts';
import { useAppStore } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

function rerollSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

export function RockPanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'rock') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<RockParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'rock'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  return (
    <Section title="Rock">
      <div className="field-row">
        <NumberField
          label="Size"
          unit="mm"
          value={params.sizeMm}
          min={5}
          step={1}
          onChange={(sizeMm) => update({ sizeMm })}
        />
        <NumberField
          label="Height"
          unit="mm"
          value={params.heightMm}
          min={2}
          step={1}
          onChange={(heightMm) => update({ heightMm })}
        />
      </div>
      <div className="field-row">
        <NumberField
          label="Irregularity"
          value={params.irregularity}
          min={0}
          max={1}
          step={0.05}
          onChange={(irregularity) => update({ irregularity })}
        />
        <NumberField
          label="Jaggedness"
          value={params.jaggedness}
          min={0}
          max={1}
          step={0.05}
          onChange={(jaggedness) => update({ jaggedness })}
        />
        <NumberField
          label="Flat spot"
          unit="mm"
          value={params.flatSpotDiameter}
          min={2}
          step={0.5}
          onChange={(flatSpotDiameter) => update({ flatSpotDiameter })}
        />
      </div>
      <button type="button" onClick={() => update({ seed: rerollSeed() })}>
        Reroll rock (seed {params.seed})
      </button>
      <p className="freeform-hint">
        The flat spot on top is guaranteed level for mounting a miniature;
        the bottom is always flat for gluing to a base.
      </p>
    </Section>
  );
}

export function CrystalPanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'crystal') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<CrystalParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'crystal'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  return (
    <Section title="Crystal cluster">
      <div className="field-row">
        <NumberField
          label="Count"
          value={params.count}
          min={1}
          max={20}
          step={1}
          onChange={(count) => update({ count: Math.max(1, Math.round(count)) })}
        />
        <NumberField
          label="Height"
          unit="mm"
          value={params.heightMm}
          min={3}
          step={1}
          onChange={(heightMm) => update({ heightMm })}
        />
        <NumberField
          label="Radius"
          unit="mm"
          value={params.radiusMm}
          min={1}
          step={0.5}
          onChange={(radiusMm) => update({ radiusMm })}
        />
      </div>
      <div className="field-row">
        <NumberField
          label="Spread"
          unit="mm"
          value={params.spreadMm}
          min={0}
          step={1}
          onChange={(spreadMm) => update({ spreadMm })}
        />
        <NumberField
          label="Pad radius"
          unit="mm"
          value={params.padRadiusMm}
          min={2}
          step={1}
          onChange={(padRadiusMm) => update({ padRadiusMm })}
        />
        <NumberField
          label="Max tilt"
          unit="deg"
          value={params.maxTiltDeg}
          min={0}
          max={35}
          step={5}
          onChange={(maxTiltDeg) => update({ maxTiltDeg })}
        />
        <NumberField
          label="Sides"
          value={params.sides}
          min={4}
          max={8}
          step={1}
          onChange={(sides) => update({ sides: Math.round(sides) })}
        />
      </div>
      <button type="button" onClick={() => update({ seed: rerollSeed() })}>
        Reroll cluster (seed {params.seed})
      </button>
    </Section>
  );
}

export function PlantsPanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'plants') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<PlantParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'plants'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  return (
    <Section title="Plants">
      <Select
        label="Variety"
        value={params.variety}
        options={[
          { value: 'grass', label: 'Grass tuft' },
          { value: 'reeds', label: 'Reeds and cattails' },
          { value: 'mushrooms', label: 'Mushrooms' },
        ]}
        onChange={(variety) => update({ variety: variety as PlantParams['variety'] })}
      />
      <div className="field-row">
        <NumberField
          label="Height"
          unit="mm"
          value={params.heightMm}
          min={2}
          max={25}
          step={1}
          onChange={(heightMm) => update({ heightMm })}
        />
        <NumberField
          label="Count"
          value={params.count}
          min={1}
          max={40}
          step={1}
          onChange={(count) => update({ count: Math.max(1, Math.round(count)) })}
        />
        <NumberField
          label="Spread"
          unit="mm"
          value={params.spreadMm}
          min={0}
          step={1}
          onChange={(spreadMm) => update({ spreadMm })}
        />
        <NumberField
          label="Pad radius"
          unit="mm"
          value={params.padRadiusMm}
          min={2}
          step={1}
          onChange={(padRadiusMm) => update({ padRadiusMm })}
        />
      </div>
      <Select
        label="Printability profile"
        value={params.profile}
        options={[
          { value: 'fdm', label: 'FDM (stockier, 40 deg lean cone)' },
          { value: 'resin', label: 'Resin (finer, 55 deg lean cone)' },
        ]}
        onChange={(profile) => update({ profile: profile as PlantParams['profile'] })}
      />
      <button type="button" onClick={() => update({ seed: rerollSeed() })}>
        Reroll tuft (seed {params.seed})
      </button>
      <p className="freeform-hint">
        Grown inside the printable overhang cone with no mid-air islands, so
        tufts print support-free at miniature scale. Mushrooms never intersect;
        ones that cannot fit are skipped, so enlarge the pad radius and spread
        for a bigger colony.
      </p>
    </Section>
  );
}
