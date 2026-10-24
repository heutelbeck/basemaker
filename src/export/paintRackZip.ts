import type { ManifoldToplevel } from 'manifold-3d';
import { buildPaintRackModule } from '../geometry/buildPaintRack.ts';
import type { PaintRackParams } from '../params/paintRack.ts';
import { planRacks } from '../params/paintRack.ts';
import type { PartsDownload } from './partsDownload.ts';
import { distinctPartsDownload } from './partsDownload.ts';

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
): PartsDownload {
  return distinctPartsDownload(
    planRacks(params).map((rack) => ({
      key: null,
      fileName: (count) =>
        `${stem}-rack-${rack.label}-${rack.unitsX}x${rack.unitsY}-print-${count}.stl`,
      build: () => buildPaintRackModule(wasm, params, rack),
    })),
  );
}
