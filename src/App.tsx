import { useEffect, useMemo, useState } from 'react';
import type { GeneratorId } from './generators/job.ts';
import { GENERATOR_LABELS, defaultJobFor } from './generators/job.ts';
import { PreviewCanvas } from './preview/PreviewCanvas.tsx';
import { bootstrapGeometry, useAppStore } from './state/store.ts';
import { Select } from './ui/controls/Select.tsx';
import { CrystalPanel, PlantsPanel, RockPanel } from './ui/panels/DecorPanels.tsx';
import { BaseplatePanel } from './ui/panels/BaseplatePanel.tsx';
import { PaintRackPanel } from './ui/panels/PaintRackPanel.tsx';
import { RulerPanel } from './ui/panels/RulerPanel.tsx';
import { TemplatePanel } from './ui/panels/TemplatePanel.tsx';
import { AdapterTrayPanel, MovementTrayPanel } from './ui/panels/TrayPanels.tsx';
import { BodyPanel } from './ui/panels/BodyPanel.tsx';
import { CollectionPanel } from './ui/panels/CollectionPanel.tsx';
import { ExportPanel } from './ui/panels/ExportPanel.tsx';
import { FacingMarkersPanel } from './ui/panels/FacingMarkersPanel.tsx';
import { LetteringPanel, SidePlaquePanel } from './ui/panels/LetteringPanel.tsx';
import { LibraryPanel } from './ui/panels/LibraryPanel.tsx';
import { MagnetsPanel } from './ui/panels/MagnetsPanel.tsx';
import { MountingHolesPanel } from './ui/panels/MountingHolesPanel.tsx';
import { RecessPanel } from './ui/panels/RecessPanel.tsx';
import { ShapePanel } from './ui/panels/ShapePanel.tsx';
import { SlottaPanel } from './ui/panels/SlottaPanel.tsx';
import { SurfacePanel } from './ui/panels/SurfacePanel.tsx';

export function App() {
  const parts = useAppStore((state) => state.parts);
  const stats = useAppStore((state) => state.stats);
  const busy = useAppStore((state) => state.busy);
  const issues = useAppStore((state) => state.issues);
  const generator = useAppStore((state) => state.job.generator);
  const overhangOverlay = useAppStore((state) => state.overhangOverlay);
  const showOverhangs = useAppStore((state) => state.showOverhangs);
  const loadCount = useAppStore((state) => state.loadCount);
  const toggleOverhangs = useAppStore((state) => state.toggleOverhangs);
  const showMockParts = useAppStore((state) => state.showMockParts);
  const toggleMockParts = useAppStore((state) => state.toggleMockParts);
  const hasMockParts = parts?.some((part) => part.previewOnly === true) ?? false;
  const visibleParts = useMemo(
    () => (showMockParts ? parts : (parts?.filter((part) => part.previewOnly !== true) ?? null)),
    [parts, showMockParts],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    bootstrapGeometry();
  }, []);

  return (
    <div className={settingsOpen ? 'app-layout settings-open' : 'app-layout'}>
      <button
        type="button"
        className="settings-toggle"
        aria-expanded={settingsOpen}
        aria-controls="settings"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        {settingsOpen ? 'Show model' : 'Settings'}
      </button>
      <aside id="settings" className="sidebar">
        <header className="app-header">
          <h1>Basemaker</h1>
          <p>Bases, trays, terrain, templates and Gridfinity paint storage, all parametric</p>
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
            <MountingHolesPanel />
            <FacingMarkersPanel />
            <SurfacePanel />
            <LetteringPanel />
            <SidePlaquePanel />
          </>
        )}
        <MovementTrayPanel />
        <AdapterTrayPanel />
        <RockPanel />
        <CrystalPanel />
        <PlantsPanel />
        <RulerPanel />
        <TemplatePanel />
        <PaintRackPanel />
        <BaseplatePanel />
        <ExportPanel />
        <LibraryPanel />
        <CollectionPanel />
      </aside>
      <main className="viewport">
        <PreviewCanvas
          parts={visibleParts}
          overhangOverlay={overhangOverlay}
          showOverhangs={showOverhangs}
          loadCount={loadCount}
        />
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
        {hasMockParts && (
          <label className="overhang-toggle mock-toggle">
            <input type="checkbox" checked={showMockParts} onChange={toggleMockParts} />
            <span>Bottles</span>
          </label>
        )}
        <label className="overhang-toggle">
          <input type="checkbox" checked={showOverhangs} onChange={toggleOverhangs} />
          <span>
            Overhangs
            {stats !== null && stats.overhangAreaMm2 > 0.5 && (
              <em> {stats.overhangAreaMm2.toFixed(0)} mm2 need support</em>
            )}
          </span>
        </label>
      </main>
    </div>
  );
}
