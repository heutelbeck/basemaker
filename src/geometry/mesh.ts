import type { Manifold, ManifoldToplevel, Mesh } from 'manifold-3d';

/** Plain, transferable triangle mesh in mm. */
export interface RawMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Extracts a plain indexed triangle mesh from a manifold. Vertex positions
 * are the first three properties of each interleaved vertex record.
 */
export function toRawMesh(manifold: Manifold): RawMesh {
  const mesh = manifold.getMesh();
  const { numProp, vertProperties, triVerts } = mesh;
  const vertexCount = vertProperties.length / numProp;
  const positions = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    positions[v * 3] = vertProperties[v * numProp];
    positions[v * 3 + 1] = vertProperties[v * numProp + 1];
    positions[v * 3 + 2] = vertProperties[v * numProp + 2];
  }
  separateVertices(positions);
  return { positions, indices: triVerts.slice() };
}

/**
 * Gives every vertex a position of its own. The kernel keeps vertices that
 * lie closer together than single precision can tell apart; an STL carries
 * no indices, and a slicer welding its facets by position would merge such
 * vertices and tear the closed surface open along slivers. A vertex on the
 * position of an earlier one is moved by the smallest possible steps in x
 * until it stands alone, far below anything a printer can resolve.
 */
function separateVertices(positions: Float32Array): void {
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, positions.length);
  const taken = new Set<string>();
  for (let v = 0; v < positions.length; v += 3) {
    let key = `${positions[v]},${positions[v + 1]},${positions[v + 2]}`;
    while (taken.has(key)) {
      bits[v] += 1;
      key = `${positions[v]},${positions[v + 1]},${positions[v + 2]}`;
    }
    taken.add(key);
  }
}

/** Rebuilds a kernel mesh from a raw mesh, e.g. to re-union cached parts. */
export function toManifoldMesh(wasm: ManifoldToplevel, mesh: RawMesh): Mesh {
  const kernelMesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: mesh.positions.slice(),
    triVerts: mesh.indices.slice(),
  });
  kernelMesh.merge();
  return kernelMesh;
}
