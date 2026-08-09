import type { OpenCascadeInstance } from 'replicad-opencascadejs/src/replicad_single.js';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import wasmUrl from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import { setOC } from 'replicad';

let ready: Promise<void> | null = null;

// The bundled declaration types init() without arguments, but the emscripten
// loader accepts module overrides such as locateFile.
const initOcct = opencascade as unknown as (options: {
  locateFile: () => string;
}) => Promise<OpenCascadeInstance>;

/**
 * Lazily loads the OCCT WASM kernel (about 11 MB) and wires it into
 * replicad. Only the STEP export path pays this cost; mesh preview and
 * STL/3MF exports stay on the lightweight Manifold kernel.
 */
export function ensureOcct(): Promise<void> {
  if (ready === null) {
    ready = initOcct({ locateFile: () => wasmUrl }).then((oc) => {
      setOC(oc);
    });
  }
  return ready;
}
