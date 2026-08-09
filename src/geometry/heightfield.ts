import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Track } from './dispose.ts';

/** Watertight terrain block: displaced top grid, flat bottom, side skirt. */
export function heightfieldBlock(
  wasm: ManifoldToplevel,
  track: Track,
  halfSize: number,
  heightAt: (x: number, y: number) => number,
  gridCells = 56,
): Manifold {
  const n = gridCells;
  const offset = ((2 * halfSize) / n) * 0.25;
  const sampled = (x: number, y: number): number =>
    (heightAt(x - offset, y - offset) +
      heightAt(x + offset, y - offset) +
      heightAt(x - offset, y + offset) +
      heightAt(x + offset, y + offset)) /
    4;
  const verts = n + 1;
  const positions = new Float32Array(verts * verts * 2 * 3);
  const topIndex = (i: number, j: number) => j * verts + i;
  const bottomIndex = (i: number, j: number) => verts * verts + j * verts + i;
  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) {
      const x = -halfSize + (2 * halfSize * i) / n;
      const y = -halfSize + (2 * halfSize * j) / n;
      const top = topIndex(i, j) * 3;
      positions[top] = x;
      positions[top + 1] = y;
      positions[top + 2] = sampled(x, y);
      const bottom = bottomIndex(i, j) * 3;
      positions[bottom] = x;
      positions[bottom + 1] = y;
      positions[bottom + 2] = 0;
    }
  }
  const triangles: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = topIndex(i, j);
      const b = topIndex(i + 1, j);
      const c = topIndex(i + 1, j + 1);
      const d = topIndex(i, j + 1);
      const e = bottomIndex(i, j);
      const f = bottomIndex(i + 1, j);
      const g = bottomIndex(i + 1, j + 1);
      const h = bottomIndex(i, j + 1);
      if ((i + j) % 2 === 0) {
        triangles.push(a, b, c, a, c, d);
        triangles.push(e, g, f, e, h, g);
      } else {
        triangles.push(a, b, d, b, c, d);
        triangles.push(e, h, f, f, h, g);
      }
    }
  }
  const skirt = (
    edge: (k: number) => [number, number],
    flip: boolean,
  ) => {
    for (let k = 0; k < n; k++) {
      const [i1, j1] = edge(k);
      const [i2, j2] = edge(k + 1);
      const t1 = topIndex(i1, j1);
      const t2 = topIndex(i2, j2);
      const b1 = bottomIndex(i1, j1);
      const b2 = bottomIndex(i2, j2);
      if (flip) {
        triangles.push(t1, b2, b1, t1, t2, b2);
      } else {
        triangles.push(t1, b1, b2, t1, b2, t2);
      }
    }
  };
  skirt((k) => [k, 0], false);
  skirt((k) => [k, n], true);
  skirt((k) => [0, k], true);
  skirt((k) => [n, k], false);

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: positions,
    triVerts: new Uint32Array(triangles),
  });
  mesh.merge();
  return track(wasm.Manifold.ofMesh(mesh));
}

