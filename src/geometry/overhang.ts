import type { RawMesh } from './mesh.ts';

/** Walls steeper than this from vertical need support on an FDM printer. */
export const MAX_OVERHANG_FROM_VERTICAL_DEG = 50;
/** Triangles this close to the build plate are supported by the bed. */
const BED_TOLERANCE = 0.05;

export interface OverhangAnalysis {
  overhangAreaMm2: number;
  overlay: RawMesh | null;
}

/**
 * Finds downward-facing triangles steeper than the printable overhang
 * cone, ignoring the bed-supported bottom. Returns the violating area and
 * an overlay mesh of just those triangles for preview highlighting.
 */
export function analyzeOverhangs(
  mesh: RawMesh,
  maxOverhangDeg: number = MAX_OVERHANG_FROM_VERTICAL_DEG,
): OverhangAnalysis {
  const { positions, indices } = mesh;
  const limit = -Math.sin((maxOverhangDeg * Math.PI) / 180);
  const violating: number[] = [];
  let area = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const za = positions[ia + 2];
    const zb = positions[ib + 2];
    const zc = positions[ic + 2];
    if (za < BED_TOLERANCE && zb < BED_TOLERANCE && zc < BED_TOLERANCE) {
      continue;
    }
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = zb - za;
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = zc - za;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) {
      continue;
    }
    if (nz / length < limit) {
      area += length / 2;
      violating.push(t);
    }
  }
  if (violating.length === 0) {
    return { overhangAreaMm2: 0, overlay: null };
  }
  const overlayPositions = new Float32Array(violating.length * 9);
  const overlayIndices = new Uint32Array(violating.length * 3);
  violating.forEach((t, i) => {
    for (let corner = 0; corner < 3; corner++) {
      const src = indices[t + corner] * 3;
      overlayPositions[i * 9 + corner * 3] = positions[src];
      overlayPositions[i * 9 + corner * 3 + 1] = positions[src + 1];
      overlayPositions[i * 9 + corner * 3 + 2] = positions[src + 2];
      overlayIndices[i * 3 + corner] = i * 3 + corner;
    }
  });
  return {
    overhangAreaMm2: area,
    overlay: { positions: overlayPositions, indices: overlayIndices },
  };
}

/**
 * Lays parts out side by side on the build plate: each part is dropped to
 * z = 0 and spaced along x, so multi-part jobs can be printed as separate
 * pieces (for example a body and its lettering inlay).
 */
export function explodeParts(parts: { mesh: RawMesh }[]): RawMesh[] {
  const spacing = 5;
  let cursor = 0;
  return parts.map((part) => {
    const { positions, indices } = part.mesh;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    for (let v = 0; v < positions.length; v += 3) {
      minX = Math.min(minX, positions[v]);
      maxX = Math.max(maxX, positions[v]);
      minZ = Math.min(minZ, positions[v + 2]);
    }
    const shifted = new Float32Array(positions.length);
    const dx = cursor - minX;
    for (let v = 0; v < positions.length; v += 3) {
      shifted[v] = positions[v] + dx;
      shifted[v + 1] = positions[v + 1];
      shifted[v + 2] = positions[v + 2] - minZ;
    }
    cursor += maxX - minX + spacing;
    return { positions: shifted, indices: indices.slice() };
  });
}
