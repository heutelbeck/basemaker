import { expose, transfer } from 'comlink';
import { writeBinaryStl } from '../export/stlBinary.ts';
import type { ThreeMfPart } from '../export/threeMf.ts';
import { writeThreeMfParts } from '../export/threeMf.ts';
import type { Job, JobBundle } from '../generators/job.ts';
import { buildJobBundle, buildJobMesh, buildJobStep } from '../generators/job.ts';
import { registerLocalFont } from '../geometry/lettering/font.ts';
import { getManifold } from '../geometry/manifoldContext.ts';
import type { RawMesh } from '../geometry/mesh.ts';
import { explodeParts } from '../geometry/overhang.ts';
import { toManifoldMesh, toRawMesh } from '../geometry/mesh.ts';

export type BuildOutput = JobBundle;

/**
 * The last built parts, kept with copied buffers so mesh exports of the
 * job already shown in the preview skip the full geometry rebuild.
 */
let cachedJobKey: string | null = null;
let cachedParts: ThreeMfPart[] | null = null;

function copyMesh(mesh: RawMesh): RawMesh {
  return { positions: mesh.positions.slice(), indices: mesh.indices.slice() };
}

function rememberParts(job: Job, parts: ThreeMfPart[]): void {
  cachedJobKey = JSON.stringify(job);
  cachedParts = parts.map((part) => ({ ...part, mesh: copyMesh(part.mesh) }));
}

async function partsFor(job: Job): Promise<ThreeMfPart[]> {
  if (cachedParts !== null && cachedJobKey === JSON.stringify(job)) {
    return cachedParts;
  }
  const wasm = await getManifold();
  const bundle = await buildJobBundle(wasm, job);
  rememberParts(job, bundle.parts);
  return cachedParts as unknown as ThreeMfPart[];
}

const api = {
  registerFont(family: string, buffer: ArrayBuffer): void {
    registerLocalFont(family, buffer);
  },
  async build(job: Job): Promise<BuildOutput> {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, job);
    rememberParts(job, bundle.parts);
    const buffers = bundle.parts.flatMap((part) => [
      part.mesh.positions.buffer,
      part.mesh.indices.buffer,
    ]);
    if (bundle.overhangOverlay !== null) {
      buffers.push(bundle.overhangOverlay.positions.buffer, bundle.overhangOverlay.indices.buffer);
    }
    return transfer(bundle, buffers);
  },
  async exportStl(job: Job): Promise<ArrayBuffer> {
    const wasm = await getManifold();
    if (cachedParts !== null && cachedJobKey === JSON.stringify(job)) {
      const solids = cachedParts.map((part) => wasm.Manifold.ofMesh(toManifoldMesh(wasm, part.mesh)));
      const union = wasm.Manifold.union(solids);
      try {
        const buffer = writeBinaryStl(toRawMesh(union));
        return transfer(buffer, [buffer]);
      } finally {
        union.delete();
        for (const solid of solids) {
          solid.delete();
        }
      }
    }
    const solid = await buildJobMesh(wasm, job);
    try {
      const buffer = writeBinaryStl(toRawMesh(solid));
      return transfer(buffer, [buffer]);
    } finally {
      solid.delete();
    }
  },
  async exportThreeMf(job: Job): Promise<Uint8Array> {
    const parts = await partsFor(job);
    const packed = writeThreeMfParts(parts);
    return transfer(packed, [packed.buffer]);
  },
  async exportThreeMfExploded(job: Job): Promise<Uint8Array> {
    const parts = await partsFor(job);
    const exploded = explodeParts(parts);
    const packed = writeThreeMfParts(parts.map((part, index) => ({ ...part, mesh: exploded[index] })));
    return transfer(packed, [packed.buffer]);
  },
  async exportStep(job: Job): Promise<ArrayBuffer> {
    const { ensureOcct } = await import('../geometry/step/occtContext.ts');
    await ensureOcct();
    const shape = await buildJobStep(job);
    const blob = shape.blobSTEP();
    const buffer = await blob.arrayBuffer();
    return transfer(buffer, [buffer]);
  },
};

export type GeometryWorkerApi = typeof api;

expose(api);
