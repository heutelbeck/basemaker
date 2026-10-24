import { zipSync } from 'fflate';
import type { Manifold } from 'manifold-3d';
import { toRawMesh } from '../geometry/mesh.ts';
import { writeBinaryStl } from './stlBinary.ts';

/** A download of the printable parts of a drawer: one plain STL, or a ZIP of several. */
export interface PartsDownload {
  data: Uint8Array;
  extension: 'stl' | 'zip';
}

/** One part to print, with the name of its file once it counts its copies. */
export interface DownloadPart {
  /** Parts with equal keys print the same; null compares the meshes instead. */
  key: string | null;
  fileName: (count: number) => string;
  /** Builds the part centered for printing; the solid is released afterwards. */
  build: () => Manifold;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * One binary STL per distinct part, named after its first part and how
 * many to print, packed into one ZIP. When all parts print the same, the
 * download is that plain STL.
 */
export function distinctPartsDownload(parts: DownloadPart[]): PartsDownload {
  const distinct: { part: DownloadPart; stl: Uint8Array; count: number }[] = [];
  for (const part of parts) {
    const keyed =
      part.key === null ? undefined : distinct.find((entry) => entry.part.key === part.key);
    if (keyed !== undefined) {
      keyed.count += 1;
      continue;
    }
    const solid = part.build();
    let stl: Uint8Array;
    try {
      stl = new Uint8Array(writeBinaryStl(toRawMesh(solid)));
    } finally {
      solid.delete();
    }
    const same =
      part.key === null ? distinct.find((entry) => sameBytes(entry.stl, stl)) : undefined;
    if (same === undefined) {
      distinct.push({ part, stl, count: 1 });
    } else {
      same.count += 1;
    }
  }
  if (distinct.length === 1) {
    return { data: distinct[0].stl, extension: 'stl' };
  }
  const files: Record<string, Uint8Array> = {};
  for (const { part, stl, count } of distinct) {
    files[part.fileName(count)] = stl;
  }
  return { data: zipSync(files), extension: 'zip' };
}
