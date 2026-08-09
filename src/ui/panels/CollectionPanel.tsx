import { useEffect, useRef, useState } from 'react';
import type { CollectionStorage, SavedBase } from '../../state/collection.ts';
import {
  LocalCollectionStorage,
  deserializeCollection,
  newSavedBase,
  serializeCollection,
} from '../../state/collection.ts';
import {
  DriveCollectionStorage,
  storeDriveClientId,
  storedDriveClientId,
} from '../../state/driveStorage.ts';
import { useAppStore } from '../../state/store.ts';
import { downloadBlob } from '../download.ts';
import { Select } from '../controls/Select.tsx';
import { Section } from './Section.tsx';

type BackendId = 'local' | 'drive';

const localStorageBackend = new LocalCollectionStorage();
const driveBackend = new DriveCollectionStorage();

export function CollectionPanel() {
  const job = useAppStore((state) => state.job);
  const replaceJob = useAppStore((state) => state.replaceJob);
  const [backend, setBackend] = useState<BackendId>('local');
  const [driveClientId, setDriveClientId] = useState(() => storedDriveClientId());
  const [driveConnected, setDriveConnected] = useState(false);
  const [entries, setEntries] = useState<SavedBase[]>([]);
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const storage: CollectionStorage = backend === 'local' ? localStorageBackend : driveBackend;
  const driveReady = backend === 'local' || driveConnected;

  const reload = (source: CollectionStorage) => {
    setStorageError(null);
    source
      .load()
      .then(setEntries)
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : String(error));
      });
  };

  useEffect(() => {
    localStorageBackend
      .load()
      .then(setEntries)
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const update = (next: SavedBase[]) => {
    setEntries(next);
    setStorageError(null);
    storage.persist(next).catch((error: unknown) => {
      setStorageError(error instanceof Error ? error.message : String(error));
    });
  };

  const switchBackend = (next: BackendId) => {
    setBackend(next);
    setEntries([]);
    if (next === 'local') {
      reload(localStorageBackend);
    } else if (driveBackend.connected) {
      reload(driveBackend);
    }
  };

  const connectDrive = () => {
    setStorageError(null);
    storeDriveClientId(driveClientId);
    driveBackend
      .connect()
      .then(() => {
        setDriveConnected(true);
        reload(driveBackend);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : String(error));
      });
  };

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      return;
    }
    update([...entries, newSavedBase(trimmed, job)]);
    setName('');
  };

  const importCollection = (file: File) => {
    setStorageError(null);
    file
      .text()
      .then((text) => {
        const imported = deserializeCollection(text);
        const known = new Set(entries.map((entry) => entry.id));
        update([...entries, ...imported.filter((entry) => !known.has(entry.id))]);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : String(error));
      });
  };

  return (
    <Section title="Collection">
      <Select
        label="Storage"
        value={backend}
        options={[
          { value: 'local', label: 'This browser' },
          { value: 'drive', label: 'Google Drive' },
        ]}
        onChange={(value) => switchBackend(value as BackendId)}
      />
      {backend === 'drive' && !driveConnected && (
        <div className="drive-setup">
          <label className="field">
            <span className="field-label">Google OAuth client id</span>
            <input
              type="text"
              placeholder="1234-abc.apps.googleusercontent.com"
              value={driveClientId}
              onChange={(event) => setDriveClientId(event.target.value)}
            />
          </label>
          <button type="button" onClick={connectDrive} disabled={driveClientId.trim() === ''}>
            Connect Google Drive
          </button>
          <p className="freeform-hint">
            Create an OAuth client id (type Web application) in the Google Cloud console with the
            Drive API enabled, add this site as an authorized JavaScript origin, and paste the id
            here. Collections are stored in the app data folder of your Drive.
          </p>
        </div>
      )}
      {driveReady && (
        <>
          <div className="collection-save">
            <input
              type="text"
              placeholder="Name this base"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  saveCurrent();
                }
              }}
            />
            <button type="button" onClick={saveCurrent} disabled={name.trim() === ''}>
              Save
            </button>
          </div>
          {entries.length > 0 && (
            <ul className="collection-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  {renamingId === entry.id ? (
                    <input
                      type="text"
                      value={renameText}
                      autoFocus
                      onChange={(event) => setRenameText(event.target.value)}
                      onBlur={() => {
                        const trimmed = renameText.trim();
                        if (trimmed !== '') {
                          update(
                            entries.map((candidate) =>
                              candidate.id === entry.id
                                ? { ...candidate, name: trimmed }
                                : candidate,
                            ),
                          );
                        }
                        setRenamingId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="collection-name"
                      title="Load this base"
                      onClick={() => replaceJob(structuredClone(entry.job))}
                    >
                      {entry.name}
                    </button>
                  )}
                  <span className="collection-actions">
                    <button
                      type="button"
                      title="Rename"
                      onClick={() => {
                        setRenamingId(entry.id);
                        setRenameText(entry.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() =>
                        update(entries.filter((candidate) => candidate.id !== entry.id))
                      }
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="collection-io">
            <button
              type="button"
              disabled={entries.length === 0}
              onClick={() =>
                downloadBlob(
                  serializeCollection(entries),
                  'basemaker-collection.json',
                  'application/json',
                )
              }
            >
              Export JSON
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) {
                  importCollection(file);
                }
                event.target.value = '';
              }}
            />
          </div>
        </>
      )}
      {storageError !== null && <p className="error-text">{storageError}</p>}
    </Section>
  );
}
