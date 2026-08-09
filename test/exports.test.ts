import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildBase } from '../src/geometry/buildBase.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { RawMesh } from '../src/geometry/mesh.ts';
import { toRawMesh } from '../src/geometry/mesh.ts';
import { writeBinaryStl } from '../src/export/stlBinary.ts';
import { writeThreeMf } from '../src/export/threeMf.ts';
import { defaultParams } from '../src/params/types.ts';

async function defaultMesh(): Promise<RawMesh> {
  const wasm = await getManifold();
  const solid = buildBase(wasm, defaultParams());
  const mesh = toRawMesh(solid);
  solid.delete();
  return mesh;
}

describe('toRawMesh', () => {
  it('produces an indexed mesh with positions for every referenced vertex', async () => {
    const mesh = await defaultMesh();
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.indices.length % 3).toBe(0);
    const vertexCount = mesh.positions.length / 3;
    for (const index of mesh.indices) {
      expect(index).toBeLessThan(vertexCount);
    }
  });

  it('keeps coordinates inside the base bounding box in mm', async () => {
    const mesh = await defaultMesh();
    for (let v = 0; v < mesh.positions.length; v += 3) {
      expect(Math.hypot(mesh.positions[v], mesh.positions[v + 1])).toBeLessThanOrEqual(16.001);
      expect(mesh.positions[v + 2]).toBeGreaterThanOrEqual(-0.001);
      expect(mesh.positions[v + 2]).toBeLessThanOrEqual(4.001);
    }
  });
});

describe('writeBinaryStl', () => {
  it('emits the exact binary layout', async () => {
    const mesh = await defaultMesh();
    const buffer = writeBinaryStl(mesh);
    const view = new DataView(buffer);
    const triangleCount = mesh.indices.length / 3;
    expect(buffer.byteLength).toBe(84 + 50 * triangleCount);
    expect(view.getUint32(80, true)).toBe(triangleCount);
  });

  it('writes unit outward normals and matching vertices for the first facet', async () => {
    const mesh = await defaultMesh();
    const view = new DataView(writeBinaryStl(mesh));
    const nx = view.getFloat32(84, true);
    const ny = view.getFloat32(88, true);
    const nz = view.getFloat32(92, true);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
    const ia = mesh.indices[0] * 3;
    expect(view.getFloat32(96, true)).toBeCloseTo(mesh.positions[ia], 5);
    expect(view.getFloat32(100, true)).toBeCloseTo(mesh.positions[ia + 1], 5);
    expect(view.getFloat32(104, true)).toBeCloseTo(mesh.positions[ia + 2], 5);
  });

  it('round-trips every facet normal as unit length', async () => {
    const mesh = await defaultMesh();
    const view = new DataView(writeBinaryStl(mesh));
    const triangleCount = mesh.indices.length / 3;
    for (let t = 0; t < triangleCount; t++) {
      const offset = 84 + t * 50;
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
    }
  });
});

describe('writeThreeMf', () => {
  it('never emits exponent notation coordinates, which 3MF forbids', async () => {
    const mesh = await defaultMesh();
    const zipped = writeThreeMf(mesh);
    const model = new TextDecoder().decode(unzipSync(zipped)['3D/3dmodel.model']);
    const vertexLines = model.split('\n').filter((line) => line.includes('<vertex'));
    expect(vertexLines.length).toBeGreaterThan(0);
    for (const line of vertexLines) {
      expect(line).not.toMatch(/[0-9]e-?[0-9]/i);
    }
  });

  it('packs a valid OPC zip with a millimeter model matching the mesh', async () => {
    const mesh = await defaultMesh();
    const zipped = writeThreeMf(mesh);
    const files = unzipSync(zipped);
    expect(Object.keys(files).sort()).toEqual([
      '3D/3dmodel.model',
      '[Content_Types].xml',
      '_rels/.rels',
    ]);
    const model = new TextDecoder().decode(files['3D/3dmodel.model']);
    expect(model).toContain('unit="millimeter"');
    const vertexCount = (model.match(/<vertex /g) ?? []).length;
    const triangleCount = (model.match(/<triangle /g) ?? []).length;
    expect(vertexCount).toBe(mesh.positions.length / 3);
    expect(triangleCount).toBe(mesh.indices.length / 3);
  });
});
