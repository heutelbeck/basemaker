import { BufferAttribute, BufferGeometry } from 'three';
import type { RawMesh } from '../geometry/mesh.ts';

/** Wraps a raw indexed mesh as a three.js BufferGeometry (positions in mm). */
export function toBufferGeometry(mesh: RawMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
