import { useState } from 'react';
import type { GameSystem } from '../../generators/library.ts';
import { GAME_SYSTEMS, libraryFor } from '../../generators/library.ts';
import { useAppStore } from '../../state/store.ts';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

export function LibraryPanel() {
  const replaceJob = useAppStore((state) => state.replaceJob);
  const [system, setSystem] = useState<GameSystem>('Warhammer 40k');

  return (
    <Section title="Game library">
      <Select
        label="Game system"
        value={system}
        options={GAME_SYSTEMS.map((name) => ({ value: name, label: name }))}
        onChange={(value) => setSystem(value as GameSystem)}
      />
      <ul className="library-list">
        {libraryFor(system).map((entry) => (
          <li key={entry.name}>
            <button
              type="button"
              className="library-entry"
              onClick={() => replaceJob(structuredClone(entry.job))}
            >
              {entry.name}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
