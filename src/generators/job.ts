import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Shape3D } from 'replicad';
import { buildBase, buildBaseSingleSolid, buildLetterSolids } from '../geometry/buildBase.ts';
import { ensureFont } from '../geometry/lettering/font.ts';
import type { RawMesh } from '../geometry/mesh.ts';
import { toRawMesh } from '../geometry/mesh.ts';
import { buildAdapterTray, buildMovementTray } from '../geometry/buildTray.ts';
import type { AdapterTrayParams, MovementTrayParams } from '../params/trays.ts';
import {
  defaultAdapterTrayParams,
  defaultMovementTrayParams,
  validateAdapterTray,
  validateMovementTray,
} from '../params/trays.ts';
import type { BaseParams } from '../params/types.ts';
import { defaultParams } from '../params/types.ts';
import type { ValidationIssue } from '../params/validate.ts';
import { validate } from '../params/validate.ts';
import { baseFilenameSlug, shapeSlug } from './filenames.ts';

/**
 * A job is one unit of generatable output: a generator id plus that
 * generator's parameter set. New generators extend this union and the
 * exhaustive switches below.
 */
export type Job =
  | { generator: 'base'; params: BaseParams }
  | { generator: 'movementTray'; params: MovementTrayParams }
  | { generator: 'adapterTray'; params: AdapterTrayParams };

export type GeneratorId = Job['generator'];

export const GENERATOR_LABELS: Record<GeneratorId, string> = {
  base: 'Base',
  movementTray: 'Movement tray',
  adapterTray: 'Adapter tray',
};

export function defaultJob(): Job {
  return { generator: 'base', params: defaultParams() };
}

export function defaultJobFor(generator: GeneratorId): Job {
  switch (generator) {
    case 'base':
      return { generator, params: defaultParams() };
    case 'movementTray':
      return { generator, params: defaultMovementTrayParams() };
    case 'adapterTray':
      return { generator, params: defaultAdapterTrayParams() };
  }
}

export function validateJob(job: Job): ValidationIssue[] {
  switch (job.generator) {
    case 'base':
      return validate(job.params);
    case 'movementTray':
      return validateMovementTray(job.params);
    case 'adapterTray':
      return validateAdapterTray(job.params);
  }
}

export async function buildJobMesh(wasm: ManifoldToplevel, job: Job): Promise<Manifold> {
  switch (job.generator) {
    case 'base': {
      const font =
        job.params.lettering !== null ? await ensureFont(job.params.lettering.font) : null;
      return buildBaseSingleSolid(wasm, job.params, font);
    }
    case 'movementTray':
      return buildMovementTray(wasm, job.params);
    case 'adapterTray':
      return buildAdapterTray(wasm, job.params);
  }
}

export interface JobPart {
  name: string;
  colorHex: string;
  mesh: RawMesh;
}

export interface JobStats {
  volumeMm3: number;
  triangles: number;
  vertices: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

export interface JobBundle {
  parts: JobPart[];
  stats: JobStats;
}

const BODY_COLOR = '#1A1A1A';

/**
 * Builds all printable parts of a job plus overall statistics. Most jobs
 * are a single part; a base with rim lettering yields the body plus the
 * letter solids so slicers and the preview can color them separately.
 */
export async function buildJobBundle(wasm: ManifoldToplevel, job: Job): Promise<JobBundle> {
  const solids: { name: string; colorHex: string; solid: Manifold }[] = [];
  try {
    if (job.generator === 'base' && job.params.lettering !== null) {
      const font = await ensureFont(job.params.lettering.font);
      solids.push({
        name: 'body',
        colorHex: BODY_COLOR,
        solid: buildBase(wasm, job.params, font),
      });
      solids.push({
        name: 'lettering',
        colorHex: job.params.lettering.colorHex,
        solid: buildLetterSolids(wasm, job.params, font),
      });
    } else {
      solids.push({
        name: 'model',
        colorHex: '#8A8A8A',
        solid: await buildJobMesh(wasm, job),
      });
    }
    let volume = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const parts: JobPart[] = [];
    let triangles = 0;
    let vertices = 0;
    for (const entry of solids) {
      volume += entry.solid.volume();
      const box = entry.solid.boundingBox();
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], box.min[axis]);
        max[axis] = Math.max(max[axis], box.max[axis]);
      }
      const mesh = toRawMesh(entry.solid);
      triangles += mesh.indices.length / 3;
      vertices += mesh.positions.length / 3;
      parts.push({ name: entry.name, colorHex: entry.colorHex, mesh });
    }
    return {
      parts,
      stats: {
        volumeMm3: volume,
        triangles,
        vertices,
        sizeX: max[0] - min[0],
        sizeY: max[1] - min[1],
        sizeZ: max[2] - min[2],
      },
    };
  } finally {
    for (const entry of solids) {
      entry.solid.delete();
    }
  }
}

/**
 * Builds the B-rep solid for STEP export. Requires an initialized OCCT.
 * Loaded dynamically so the replicad layer stays out of the mesh bundle.
 */
export async function buildJobStep(job: Job): Promise<Shape3D> {
  switch (job.generator) {
    case 'base': {
      const { buildStepShape } = await import('../geometry/step/buildStepShape.ts');
      const font =
        job.params.lettering !== null ? await ensureFont(job.params.lettering.font) : null;
      return buildStepShape(job.params, font);
    }
    case 'movementTray': {
      const { buildStepMovementTray } = await import('../geometry/step/buildStepTray.ts');
      return buildStepMovementTray(job.params);
    }
    case 'adapterTray': {
      const { buildStepAdapterTray } = await import('../geometry/step/buildStepTray.ts');
      return buildStepAdapterTray(job.params);
    }
  }
}

export function jobFilename(job: Job, extension: string): string {
  switch (job.generator) {
    case 'base':
      return `${baseFilenameSlug(job.params)}.${extension}`;
    case 'movementTray': {
      const { rows, cols, pocketShape } = job.params;
      return `tray-${cols}x${rows}-${shapeSlug(pocketShape)}.${extension}`;
    }
    case 'adapterTray': {
      const { rows, cols, donor, target } = job.params;
      return `adapter-${cols}x${rows}-${shapeSlug(donor)}-to-${shapeSlug(target)}.${extension}`;
    }
  }
}
