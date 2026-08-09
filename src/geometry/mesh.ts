import type { Manifold } from 'manifold-3d';

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
  return { positions, indices: triVerts.slice() };
}
