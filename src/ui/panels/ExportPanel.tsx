import { useState } from 'react';
import { outlineFor } from '../../geometry/tessellation.ts';
import { jobFilename } from '../../generators/job.ts';
import { freeformOutline } from '../../params/freeform.ts';
import { resolveShape } from '../../params/shapeMetrics.ts';
import {
  exportStep,
  exportStl,
  exportThreeMf,
  setJobQuality,
  useAppStore,
} from '../../state/store.ts';
import { downloadBlob } from '../download.ts';
import { Section } from './Section.tsx';

interface QualityPreset {
  label: string;
  chordTolMm: number;
}

const PRESETS: QualityPreset[] = [
  { label: 'Draft', chordTolMm: 0.1 },
  { label: 'High', chordTolMm: 0.02 },
  { label: 'Ultra', chordTolMm: 0.005 },
];

const SLIDER_MIN_LOG = Math.log10(0.002);
const SLIDER_MAX_LOG = Math.log10(0.2);

export function ExportPanel() {
  const job = useAppStore((state) => state.job);
  const issues = useAppStore((state) => state.issues);
  const stats = useAppStore((state) => state.stats);
  const busy = useAppStore((state) => state.busy);
  const buildError = useAppStore((state) => state.buildError);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const blocked = issues.length > 0 || exporting;

  const tol = job.params.quality.chordTolMm;
  const sliderValue = Math.log10(tol);
  const segmentReadout = (() => {
    if (job.generator !== 'base') {
      return null;
    }
    const shape = job.params.shape;
    const outerSpec = shape.kind === 'converter' ? shape.outer : shape;
    if (outerSpec.kind === 'freeform') {
      return freeformOutline(outerSpec, tol).length;
    }
    return outlineFor(resolveShape(outerSpec), tol).length;
  })();

  const runExport = async (format: 'stl' | '3mf' | 'step') => {
    setExporting(true);
    setExportError(null);
    try {
      if (format === 'stl') {
        const buffer = await exportStl(job);
        downloadBlob(buffer, jobFilename(job, 'stl'), 'model/stl');
      } else if (format === '3mf') {
        const packed = await exportThreeMf(job);
        const copy = new Uint8Array(packed);
        downloadBlob(copy, jobFilename(job, '3mf'), 'model/3mf');
      } else {
        const buffer = await exportStep(job);
        downloadBlob(buffer, jobFilename(job, 'step'), 'application/step');
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Section title="Export">
      <div className="quality-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={preset.chordTolMm === tol ? 'chip chip-active' : 'chip'}
            onClick={() => setJobQuality(preset.chordTolMm)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">
          Resolution (chord tolerance)
          <span className="field-unit">mm</span>
        </span>
        <input
          type="range"
          min={SLIDER_MIN_LOG}
          max={SLIDER_MAX_LOG}
          step={0.01}
          value={sliderValue}
          onChange={(event) =>
            setJobQuality(Number((10 ** Number(event.target.value)).toPrecision(2)))
          }
        />
      </label>
      <p className="quality-readout">
        {tol} mm max facet depth
        {segmentReadout !== null && `, ${segmentReadout} outline segments`}
      </p>
      <div className="export-buttons">
        <button type="button" disabled={blocked} onClick={() => void runExport('stl')}>
          Download STL
        </button>
        <button type="button" disabled={blocked} onClick={() => void runExport('3mf')}>
          Download 3MF
        </button>
        <button
          type="button"
          disabled={blocked}
          title="True curves via the OCCT kernel. The first STEP export loads an 11 MB module."
          onClick={() => void runExport('step')}
        >
          Download STEP
        </button>
      </div>
      <p className="freeform-hint">
        STL and 3MF are tessellated at this resolution; the chord tolerance applies to every curved
        feature, including magnet slots, holders, and support pillars. STEP always exports true
        curves and is smooth at any setting.
      </p>
      {stats !== null && (
        <p className="stats-readout">
          {stats.triangles.toLocaleString('en-US')} triangles, {(stats.volumeMm3 / 1000).toFixed(2)}{' '}
          cm3
          {busy && ' (rebuilding)'}
        </p>
      )}
      {buildError !== null && <p className="error-text">{buildError}</p>}
      {exportError !== null && <p className="error-text">{exportError}</p>}
      {issues.length > 0 && (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}
