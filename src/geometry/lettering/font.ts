import type { Font } from 'opentype.js';
import * as opentype from 'opentype.js';
import type { LetteringFontFace } from '../../params/types.ts';

// Node's ESM loader does not detect opentype.js's named CommonJS exports,
// so the parse function must be resolved through the default export there.
const parse: typeof opentype.parse =
  (opentype as { default?: typeof opentype }).default?.parse ?? opentype.parse;

const loaded = new Map<LetteringFontFace, Promise<Font>>();
const injected = new Map<LetteringFontFace, Font>();

/**
 * Registers a session-local font (e.g. from the Local Font Access API)
 * under its family name so lettering can use it immediately.
 */
export function registerLocalFont(family: string, buffer: ArrayBuffer): Font {
  const font = parse(buffer);
  injected.set(family, font);
  loaded.delete(family);
  return font;
}

async function fetchFace(face: LetteringFontFace): Promise<Font> {
  const module =
    face === 'serif'
      ? await import('dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf?url')
      : face === 'mono'
        ? await import('dejavu-fonts-ttf/ttf/DejaVuSansMono-Bold.ttf?url')
        : await import('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url');
  const response = await fetch(module.default);
  return parse(await response.arrayBuffer());
}

/**
 * Provides the bundled lettering fonts. In the browser the TTF assets are
 * fetched lazily per face; tests and Node scripts inject the font bytes
 * directly with initFontFromBuffer because file URLs are not fetchable
 * there.
 */
export function ensureFont(face: LetteringFontFace = 'sans'): Promise<Font> {
  const preloaded = injected.get(face);
  if (preloaded !== undefined) {
    return Promise.resolve(preloaded);
  }
  let pending = loaded.get(face);
  if (pending === undefined) {
    pending = fetchFace(face).then((font) => {
      injected.set(face, font);
      return font;
    });
    loaded.set(face, pending);
  }
  return pending;
}

/**
 * The already loaded font for a face, or null when it has not been
 * ensured yet. Geometry code uses this to resolve per-plaque fonts
 * synchronously after the job layer awaited ensureFont for every face
 * in use.
 */
export function fontFor(face: LetteringFontFace): Font | null {
  return injected.get(face) ?? null;
}

export function initFontFromBuffer(buffer: ArrayBuffer, face: LetteringFontFace = 'sans'): Font {
  const font = parse(buffer);
  injected.set(face, font);
  return font;
}
