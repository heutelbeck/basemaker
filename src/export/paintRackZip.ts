import { zipSync } from 'fflate';
import type { ManifoldToplevel } from 'manifold-3d';
import { buildPaintRackModule } from '../geometry/buildPaintRack.ts';
import { toRawMesh } from '../geometry/mesh.ts';
import type { PaintRackModule, PaintRackParams } from '../params/paintRack.ts';
import { planRacks } from '../params/paintRack.ts';
import { writeBinaryStl } from './stlBinary.ts';

/** A paint rack download: one plain STL, or a ZIP of several. */
export interface RackDownload {
  data: Uint8Array;
  extension: 'stl' | 'zip';
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The racks of a paint rack drawer for printing, each centered on the
 * origin: one binary STL per distinct rack, named after its first rack and
 * how many to print, packed into one ZIP named after `stem`. A drawer of
 * one distinct rack comes as that plain STL.
 */
export function paintRackDownload(
  wasm: ManifoldToplevel,
  params: PaintRackParams,
  stem: string,
): RackDownload {
  const distinct: { rack: PaintRackModule; stl: Uint8Array; count: number }[] = [];
  for (const rack of planRacks(params)) {
    const centered = buildPaintRackModule(wasm, params, rack);
    let stl: Uint8Array;
    try {
      stl = new Uint8Array(writeBinaryStl(toRawMesh(centered)));
    } finally {
      centered.delete();
    }
    const same = distinct.find((entry) => sameBytes(entry.stl, stl));
    if (same === undefined) {
      distinct.push({ rack, stl, count: 1 });
    } else {
      same.count += 1;
    }
  }
  if (distinct.length === 1) {
    return { data: distinct[0].stl, extension: 'stl' };
  }
  const files: Record<string, Uint8Array> = {};
  for (const { rack, stl, count } of distinct) {
    files[`${stem}-rack-${rack.label}-${rack.unitsX}x${rack.unitsY}-print-${count}.stl`] = stl;
  }
  return { data: zipSync(files), extension: 'zip' };
}
