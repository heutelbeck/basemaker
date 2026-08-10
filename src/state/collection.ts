import type { Job } from '../generators/job.ts';
import type { BaseParams } from '../params/types.ts';

export interface SavedBase {
  id: string;
  name: string;
  savedAt: string;
  job: Job;
}

interface CollectionDocument {
  version: 1 | 2;
  entries: StoredEntry[];
}

/** Version 1 entries stored bare base parameters instead of jobs. */
type StoredEntry = SavedBase | (Omit<SavedBase, 'job'> & { params: BaseParams });

/**
 * Storage backend seam for the collection manager. The browser-local
 * implementation is the default; remote backends such as Google Drive
 * implement the same asynchronous interface.
 */
export interface CollectionStorage {
  load(): Promise<SavedBase[]>;
  persist(entries: SavedBase[]): Promise<void>;
}

const STORAGE_KEY = 'basemaker.collection.v1';

function migrate(entry: StoredEntry): SavedBase {
  const migrated: SavedBase =
    'job' in entry
      ? entry
      : (() => {
          const { params, ...rest } = entry;
          return { ...rest, job: { generator: 'base', params } };
        })();
  if (migrated.job.generator === 'movementTray' || migrated.job.generator === 'adapterTray') {
    if (migrated.job.params.sheetInlay !== null) {
      migrated.job.params.sheetInlay.placement ??= 'underside';
    }
    if (migrated.job.generator === 'adapterTray') {
      migrated.job.params.cellMarkers ??= false;
    }
    if (migrated.job.generator === 'movementTray') {
      migrated.job.params.pocketRotated ??= false;
      migrated.job.params.formation ??= 'grid';
      migrated.job.params.style ??= 'solid';
      migrated.job.params.webCellMm ??= 4;
      migrated.job.params.webStrutMm ??= 1.2;
      migrated.job.params.accent ??= null;
      if (migrated.job.params.accent !== null) {
        migrated.job.params.accent.placement ??= 'bottom';
      }
    }
  }
  if (migrated.job.generator === 'rock') {
    const rock = migrated.job.params as {
      heightMm?: number;
      heightFraction?: number;
      jaggedness?: number;
      sizeMm: number;
    };
    rock.heightMm ??= rock.sizeMm * (rock.heightFraction ?? 0.75) * 0.55;
    rock.jaggedness ??= 0.35;
  }
  if (migrated.job.generator === 'ruler') {
    migrated.job.params.pivotsPerJoint ??= 1;
    migrated.job.params.splitEveryUnits ??= 0;
    migrated.job.params.rotateNumbers ??= true;
  }
  if (migrated.job.generator === 'crystal') {
    migrated.job.params.padRadiusMm ??=
      migrated.job.params.spreadMm + migrated.job.params.radiusMm + 1.5;
  }
  if (migrated.job.generator === 'plants') {
    migrated.job.params.padRadiusMm ??= migrated.job.params.spreadMm + 1.5;
  }
  if (migrated.job.generator === 'base') {
    migrated.job.params.lipRadius ??= 0;
    if (migrated.job.params.magnets !== null) {
      migrated.job.params.magnets.layout ??= 'line';
    }
    migrated.job.params.lettering ??= null;
    migrated.job.params.plaque ??= null;
    if (migrated.job.params.plaque !== null) {
      migrated.job.params.plaque.rivetHeightMm ??= 0.2;
      migrated.job.params.plaque.colorHex ??= '#9AA5B1';
      migrated.job.params.plaque.thicknessMm ??=
        migrated.job.params.plaque.style === 'plate' ? 0.7 : 0.5;
    }
    migrated.job.params.surface ??= null;
    const surface = migrated.job.params.surface;
    if (surface !== null) {
      if (surface.type === 'cobblestone') {
        surface.domed ??= false;
      } else if (surface.type === 'planks') {
        surface.grain ??= true;
      } else if (surface.type === 'pond') {
        surface.count ??= 1;
        surface.roughness ??= 0.35;
        surface.shoreGradient ??= true;
      } else if (surface.type === 'steelPlates') {
        surface.detailHeight ??= 0.35;
      }
    }
    if (migrated.job.params.hollow !== null) {
      migrated.job.params.hollow.supports ??= null;
      if (migrated.job.params.hollow.supports !== null) {
        migrated.job.params.hollow.supports.style ??= 'pillars';
      }
    }
    if (migrated.job.params.lettering !== null) {
      migrated.job.params.lettering.style ??= 'engraved';
      migrated.job.params.lettering.strokeBoostMm ??= 0;
      migrated.job.params.lettering.placement ??= 'top';
      migrated.job.params.lettering.font ??= 'sans';
    }
  }
  return migrated;
}

export class LocalCollectionStorage implements CollectionStorage {
  load(): Promise<SavedBase[]> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return Promise.resolve([]);
      }
      const parsed = JSON.parse(raw) as CollectionDocument;
      if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.entries)) {
        return Promise.resolve([]);
      }
      return Promise.resolve(parsed.entries.map(migrate));
    } catch {
      return Promise.resolve([]);
    }
  }

  persist(entries: SavedBase[]): Promise<void> {
    const document: CollectionDocument = { version: 2, entries };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    return Promise.resolve();
  }
}

export function serializeCollection(entries: SavedBase[]): string {
  const document: CollectionDocument = { version: 2, entries };
  return JSON.stringify(document, null, 2);
}

export function deserializeCollection(json: string): SavedBase[] {
  const parsed = JSON.parse(json) as CollectionDocument;
  if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.entries)) {
    throw new Error('The file is not a valid basemaker collection.');
  }
  return parsed.entries.map(migrate);
}

export function newSavedBase(name: string, job: Job): SavedBase {
  return {
    id: crypto.randomUUID(),
    name,
    savedAt: new Date().toISOString(),
    job: structuredClone(job),
  };
}
