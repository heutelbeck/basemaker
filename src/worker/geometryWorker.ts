import { expose, transfer } from 'comlink';
import { writeBinaryStl } from '../export/stlBinary.ts';
import { writeThreeMfParts } from '../export/threeMf.ts';
import type { Job, JobBundle } from '../generators/job.ts';
import { buildJobBundle, buildJobMesh, buildJobStep } from '../generators/job.ts';
import { getManifold } from '../geometry/manifoldContext.ts';
import { toRawMesh } from '../geometry/mesh.ts';

export type BuildOutput = JobBundle;

const api = {
  async build(job: Job): Promise<BuildOutput> {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, job);
    const buffers = bundle.parts.flatMap((part) => [
      part.mesh.positions.buffer,
      part.mesh.indices.buffer,
    ]);
    return transfer(bundle, buffers);
  },
  async exportStl(job: Job): Promise<ArrayBuffer> {
    const wasm = await getManifold();
    const solid = await buildJobMesh(wasm, job);
    try {
      const buffer = writeBinaryStl(toRawMesh(solid));
      return transfer(buffer, [buffer]);
    } finally {
      solid.delete();
    }
  },
  async exportThreeMf(job: Job): Promise<Uint8Array> {
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, job);
    const packed = writeThreeMfParts(bundle.parts);
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
