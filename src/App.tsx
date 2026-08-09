import { useEffect } from 'react';
import type { GeneratorId } from './generators/job.ts';
import { GENERATOR_LABELS, defaultJobFor } from './generators/job.ts';
import { PreviewCanvas } from './preview/PreviewCanvas.tsx';
import { bootstrapGeometry, useAppStore } from './state/store.ts';
import { Select } from './ui/controls/Select.tsx';
import { AdapterTrayPanel, MovementTrayPanel } from './ui/panels/TrayPanels.tsx';
import { BodyPanel } from './ui/panels/BodyPanel.tsx';
import { CollectionPanel } from './ui/panels/CollectionPanel.tsx';
import { ExportPanel } from './ui/panels/ExportPanel.tsx';
import { LetteringPanel } from './ui/panels/LetteringPanel.tsx';
import { LibraryPanel } from './ui/panels/LibraryPanel.tsx';
import { MagnetsPanel } from './ui/panels/MagnetsPanel.tsx';
import { RecessPanel } from './ui/panels/RecessPanel.tsx';
import { ShapePanel } from './ui/panels/ShapePanel.tsx';
import { SlottaPanel } from './ui/panels/SlottaPanel.tsx';

export function App() {
  const parts = useAppStore((state) => state.parts);
  const stats = useAppStore((state) => state.stats);
  const busy = useAppStore((state) => state.busy);
  const issues = useAppStore((state) => state.issues);
  const generator = useAppStore((state) => state.job.generator);

  useEffect(() => {
    bootstrapGeometry();
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <header className="app-header">
          <h1>Basemaker</h1>
          <p>Parametric miniature bases, printable smooth</p>
        </header>
        <Select
          label="Generator"
          value={generator}
          options={(Object.keys(GENERATOR_LABELS) as GeneratorId[]).map((id) => ({
            value: id,
            label: GENERATOR_LABELS[id],
          }))}
          onChange={(id) => {
            useAppStore.getState().replaceJob(defaultJobFor(id as GeneratorId));
          }}
        />
        {generator === 'base' && (
          <>
            <ShapePanel />
            <BodyPanel />
            <MagnetsPanel />
            <RecessPanel />
            <SlottaPanel />
            <LetteringPanel />
          </>
        )}
        <MovementTrayPanel />
        <AdapterTrayPanel />
        <ExportPanel />
        <LibraryPanel />
        <CollectionPanel />
      </aside>
      <main className="viewport">
        <PreviewCanvas parts={parts} />
        {busy && <div className="busy-badge">Rebuilding</div>}
        {issues.length > 0 && (
          <div className="stale-badge">
            Invalid parameters; showing the last valid model. See the export panel for details.
          </div>
        )}
        {stats !== null && (
          <div className="dims-badge">
            {stats.sizeX.toFixed(1)} x {stats.sizeY.toFixed(1)} x {stats.sizeZ.toFixed(1)} mm
          </div>
        )}
      </main>
    </div>
  );
}
