import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';

let instance: Promise<ManifoldToplevel> | null = null;

/** Loads and initializes the Manifold WASM module exactly once. */
export function getManifold(): Promise<ManifoldToplevel> {
  if (instance === null) {
    instance = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return instance;
}
