import type { ManifoldToplevel } from 'manifold-3d';
import { baseplatePieces, buildBaseplatePiece } from '../geometry/buildBaseplate.ts';
import type { BaseplateParams } from '../params/baseplate.ts';
import { baseplatePrintKey } from '../params/baseplate.ts';
import type { PartsDownload } from './partsDownload.ts';
import { distinctPartsDownload } from './partsDownload.ts';

/**
 * The parts of a drawer baseplate for printing, each centered on the
 * origin: one binary STL per distinct part (parts that match after a half
 * turn count as one), named after its first part and how many to print,
 * packed into one ZIP named after `stem`; a single distinct part comes as
 * that plain STL.
 */
export function baseplateDownload(
  wasm: ManifoldToplevel,
  params: BaseplateParams,
  stem: string,
): PartsDownload {
  return distinctPartsDownload(
    baseplatePieces(params).map((piece) => ({
      key: baseplatePrintKey(piece),
      fileName: (count) =>
        `${stem}-part-${piece.label}-${piece.unitsX}x${piece.unitsY}-print-${count}.stl`,
      build: () => buildBaseplatePiece(wasm, params, piece),
    })),
  );
}
