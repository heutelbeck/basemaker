import type { CollectionStorage, SavedBase } from './collection.ts';
import { deserializeCollection, serializeCollection } from './collection.ts';

const CLIENT_ID_KEY = 'basemaker.drive.clientId';
const COLLECTION_FILENAME = 'basemaker-collection.json';
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const ERROR_NO_CLIENT_ID =
  'A Google OAuth client id is required; enter one in the collection settings.';
const ERROR_NOT_CONNECTED = 'Google Drive is not connected. Connect before loading or saving.';

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

export function storedDriveClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) ?? '';
}

export function storeDriveClientId(clientId: string): void {
  localStorage.setItem(CLIENT_ID_KEY, clientId.trim());
}

let gsiLoaded: Promise<GoogleIdentityServices> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentityServices> {
  if (gsiLoaded === null) {
    gsiLoaded = new Promise((resolve, reject) => {
      if (window.google !== undefined) {
        resolve(window.google);
        return;
      }
      const script = document.createElement('script');
      script.src = GSI_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (window.google !== undefined) {
          resolve(window.google);
        } else {
          reject(new Error('The Google Identity Services script did not initialize.'));
        }
      };
      script.onerror = () => {
        gsiLoaded = null;
        reject(new Error('The Google Identity Services script failed to load.'));
      };
      document.head.appendChild(script);
    });
  }
  return gsiLoaded;
}

/**
 * Collection storage backed by a single JSON document in the user's Google
 * Drive application data folder. The user authorizes access through the
 * Google Identity Services token flow with their own OAuth client id; the
 * app never sees credentials, only a short-lived access token.
 */
export class DriveCollectionStorage implements CollectionStorage {
  private accessToken: string | null = null;

  get connected(): boolean {
    return this.accessToken !== null;
  }

  async connect(): Promise<void> {
    const clientId = storedDriveClientId();
    if (clientId === '') {
      throw new Error(ERROR_NO_CLIENT_ID);
    }
    const google = await loadGoogleIdentity();
    this.accessToken = await new Promise<string>((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (response) => {
          if (response.access_token !== undefined) {
            resolve(response.access_token);
          } else {
            reject(
              new Error(`Google Drive authorization failed: ${response.error ?? 'unknown error'}.`),
            );
          }
        },
      });
      client.requestAccessToken();
    });
  }

  disconnect(): void {
    this.accessToken = null;
  }

  async load(): Promise<SavedBase[]> {
    const fileId = await this.findCollectionFile();
    if (fileId === null) {
      return [];
    }
    const response = await this.driveFetch(`${DRIVE_FILES_API}/${fileId}?alt=media`);
    return deserializeCollection(await response.text());
  }

  async persist(entries: SavedBase[]): Promise<void> {
    const body = serializeCollection(entries);
    const fileId = await this.findCollectionFile();
    if (fileId !== null) {
      await this.driveFetch(`${DRIVE_UPLOAD_API}/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      return;
    }
    const metadata = { name: COLLECTION_FILENAME, parents: ['appDataFolder'] };
    const boundary = 'basemakerBoundary';
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      body,
      `--${boundary}--`,
      '',
    ].join('\r\n');
    await this.driveFetch(`${DRIVE_UPLOAD_API}?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
  }

  private async findCollectionFile(): Promise<string | null> {
    const query = encodeURIComponent(`name='${COLLECTION_FILENAME}'`);
    const url = `${DRIVE_FILES_API}?spaces=appDataFolder&q=${query}&fields=files(id)`;
    const response = await this.driveFetch(url);
    const payload = (await response.json()) as { files?: { id: string }[] };
    return payload.files?.[0]?.id ?? null;
  }

  private async driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.accessToken === null) {
      throw new Error(ERROR_NOT_CONNECTED);
    }
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.accessToken}` },
    });
    if (response.status === 401) {
      this.accessToken = null;
      throw new Error(ERROR_NOT_CONNECTED);
    }
    if (!response.ok) {
      throw new Error(`Google Drive request failed with status ${response.status}.`);
    }
    return response;
  }
}
