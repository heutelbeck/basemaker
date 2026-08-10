import type {
  AdapterTrayParams,
  MovementTrayParams,
  SheetInlayParams,
  TrayAccent,
} from '../../params/trays.ts';
import { useAppStore } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Section } from './Section.tsx';
import { ShapeEditor } from './ShapeEditor.tsx';

const DEFAULT_INLAY: SheetInlayParams = { depth: 0.6, inset: 2, placement: 'underside' };

interface TrayNumbers {
  rows: number;
  cols: number;
  clearance: number;
  rim: number;
  pocketDepth: number;
  floor: number;
  edgeSlope: number;
  sheetInlay: SheetInlayParams | null;
}

function TrayCommonFields({
  values,
  onChange,
  lance = false,
}: {
  values: TrayNumbers;
  onChange: (change: Partial<TrayNumbers>) => void;
  lance?: boolean;
}) {
  const lanceModels = (values.rows * (values.rows + 1)) / 2;
  return (
    <>
      <div className="field-row">
        {!lance && (
          <NumberField
            label="Columns"
            value={values.cols}
            min={1}
            max={20}
            step={1}
            onChange={(cols) => onChange({ cols: Math.max(1, Math.round(cols)) })}
          />
        )}
        <NumberField
          label={lance ? `Ranks (${lanceModels} models)` : 'Rows'}
          value={values.rows}
          min={1}
          max={20}
          step={1}
          onChange={(rows) => onChange({ rows: Math.max(1, Math.round(rows)) })}
        />
      </div>
      <div className="field-row">
        <NumberField
          label="Clearance"
          unit="mm"
          value={values.clearance}
          min={0}
          step={0.05}
          onChange={(clearance) => onChange({ clearance })}
        />
        <NumberField
          label="Rim"
          unit="mm"
          value={values.rim}
          min={0}
          step={0.5}
          onChange={(rim) => onChange({ rim })}
        />
      </div>
      <div className="field-row">
        <NumberField
          label="Pocket depth"
          unit="mm"
          value={values.pocketDepth}
          min={0.5}
          step={0.5}
          onChange={(pocketDepth) => onChange({ pocketDepth })}
        />
        <NumberField
          label="Floor"
          unit="mm"
          value={values.floor}
          min={0.4}
          step={0.2}
          onChange={(floor) => onChange({ floor })}
        />
        <NumberField
          label="Edge slope"
          unit="mm"
          value={values.edgeSlope}
          min={0}
          step={0.25}
          onChange={(edgeSlope) => onChange({ edgeSlope })}
        />
      </div>
      <Section
        title="Sheet inlay"
        enabled={values.sheetInlay !== null}
        onToggle={(enabled) => onChange({ sheetInlay: enabled ? DEFAULT_INLAY : null })}
      >
        {values.sheetInlay !== null && (
          <>
            <Select
              label="Placement"
              value={values.sheetInlay.placement}
              options={[
                { value: 'underside', label: 'Underside (one hidden sheet)' },
                { value: 'pockets', label: 'Pocket floors (pieces under bases)' },
              ]}
              onChange={(placement) =>
                onChange({
                  sheetInlay: {
                    ...(values.sheetInlay ?? DEFAULT_INLAY),
                    placement: placement as SheetInlayParams['placement'],
                  },
                })
              }
            />
            <div className="field-row">
              <NumberField
                label="Depth"
                unit="mm"
                value={values.sheetInlay.depth}
                min={0.2}
                step={0.1}
                onChange={(depth) =>
                  onChange({ sheetInlay: { ...(values.sheetInlay ?? DEFAULT_INLAY), depth } })
                }
              />
              {values.sheetInlay.placement === 'underside' && (
                <NumberField
                  label="Inset"
                  unit="mm"
                  value={values.sheetInlay.inset}
                  min={0}
                  step={0.5}
                  onChange={(inset) =>
                    onChange({ sheetInlay: { ...(values.sheetInlay ?? DEFAULT_INLAY), inset } })
                  }
                />
              )}
            </div>
          </>
        )}
      </Section>
    </>
  );
}

export function MovementTrayPanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'movementTray') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<MovementTrayParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'movementTray'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  return (
    <>
      <Section title="Pocket base">
        <ShapeEditor
          shape={params.pocketShape}
          onChange={(pocketShape) => update({ pocketShape })}
        />
        <Toggle
          label="Rotate bases 90 degrees (cavalry frontage)"
          checked={params.pocketRotated}
          onChange={(pocketRotated) => update({ pocketRotated })}
        />
      </Section>
      <Section title="Tray">
        <Select
          label="Tray style"
          value={params.style}
          options={[
            { value: 'solid', label: 'Solid with pockets' },
            { value: 'skeleton', label: 'Skeleton rings (floorless)' },
            { value: 'honeycomb', label: 'Honeycomb web' },
          ]}
          onChange={(style) =>
            update({
              style: style as MovementTrayParams['style'],
              rim: style === 'solid' ? 3 : 2,
              gap: style === 'skeleton' ? 6 : 0,
              pocketDepth: style === 'honeycomb' ? 0.6 : 2.5,
            })
          }
        />
        {params.style === 'honeycomb' && (
          <div className="field-row">
            <NumberField
              label="Cell"
              unit="mm"
              value={params.webCellMm}
              min={2}
              step={0.5}
              onChange={(webCellMm) => update({ webCellMm })}
            />
            <NumberField
              label="Strut"
              unit="mm"
              value={params.webStrutMm}
              min={0.8}
              step={0.1}
              onChange={(webStrutMm) => update({ webStrutMm })}
            />
          </div>
        )}
        {params.style !== 'solid' && (
          <p className="freeform-hint">
            Skeleton trays are stepped ring sockets joined by flat bridges: bases rest on an inner
            ledge over an open ring. Honeycomb trays are one shared basin with a hex mesh floor
            and a low rim lip. Edge slope and sheet inlays apply to solid trays only.
          </p>
        )}
        <Section
          title="Accent bottom layer"
          enabled={params.accent !== null}
          onToggle={(enabled) =>
            update({
              accent: enabled
                ? { colorHex: '#39d353', layerMm: 0.6, outsetMm: 0.8, placement: 'top' }
                : null,
            })
          }
        >
          {params.accent !== null && (
            <>
              <Select
                label="Placement"
                value={params.accent.placement}
                options={[
                  { value: 'top', label: 'Top layer' },
                  { value: 'bottom', label: 'Bottom layer' },
                  { value: 'both', label: 'Top and bottom' },
                ]}
                onChange={(placement) =>
                  update({
                    accent: {
                      ...(params.accent as TrayAccent),
                      placement: placement as TrayAccent['placement'],
                    },
                  })
                }
              />
              <div className="field-row">
                <NumberField
                  label="Layer"
                  unit="mm"
                  value={params.accent.layerMm}
                  min={0.2}
                  step={0.2}
                  onChange={(layerMm) =>
                    update({ accent: { ...(params.accent as TrayAccent), layerMm } })
                  }
                />
                <NumberField
                  label="Outset"
                  unit="mm"
                  value={params.accent.outsetMm}
                  min={0}
                  max={3}
                  step={0.2}
                  onChange={(outsetMm) =>
                    update({ accent: { ...(params.accent as TrayAccent), outsetMm } })
                  }
                />
              </div>
              <label className="field">
                <span className="field-label">Accent color (3MF export)</span>
                <input
                  type="color"
                  value={params.accent.colorHex}
                  onChange={(event) =>
                    update({
                      accent: { ...(params.accent as TrayAccent), colorHex: event.target.value },
                    })
                  }
                />
              </label>
              <p className="freeform-hint">
                A layer in a second color, slightly larger than the tray, showing as a contour
                band around the silhouette and inside every opening. 3MF and STL only.
              </p>
            </>
          )}
        </Section>
        <Select
          label="Formation"
          value={params.formation}
          options={[
            { value: 'grid', label: 'Ranked block' },
            { value: 'lance', label: 'Lance wedge (Bretonnian)' },
            { value: 'skirmish', label: 'Loose skirmish (offset rows)' },
          ]}
          onChange={(formation) =>
            update({ formation: formation as MovementTrayParams['formation'] })
          }
        />
        <TrayCommonFields values={params} onChange={update} lance={params.formation === 'lance'} />
        <NumberField
          label="Gap between pockets"
          unit="mm"
          value={params.gap}
          min={0}
          step={0.5}
          onChange={(gap) => update({ gap })}
        />
      </Section>
    </>
  );
}

export function AdapterTrayPanel() {
  const job = useAppStore((state) => state.job);
  if (job.generator !== 'adapterTray') {
    return null;
  }
  const params = job.params;
  const update = (change: Partial<AdapterTrayParams>) => {
    useAppStore
      .getState()
      .setJob((current) =>
        current.generator === 'adapterTray'
          ? { ...current, params: { ...current.params, ...change } }
          : current,
      );
  };
  return (
    <>
      <Section title="Donor base (old)">
        <ShapeEditor shape={params.donor} onChange={(donor) => update({ donor })} />
      </Section>
      <Section title="Target base (new)">
        <ShapeEditor shape={params.target} onChange={(target) => update({ target })} />
      </Section>
      <Section title="Tray">
        <TrayCommonFields values={params} onChange={update} />
        <Toggle
          label="Score lines marking target cell edges"
          checked={params.cellMarkers}
          onChange={(cellMarkers) => update({ cellMarkers })}
        />
      </Section>
    </>
  );
}
