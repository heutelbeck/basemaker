import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Shape3D } from 'replicad';
import { buildBase, buildBaseSingleSolid, buildLetterSolids, buildPlaqueSolidLettered } from '../geometry/buildBase.ts';
import { ensureFont } from '../geometry/lettering/font.ts';
import type { RawMesh } from '../geometry/mesh.ts';
import { analyzeOverhangs } from '../geometry/overhang.ts';
import { toRawMesh } from '../geometry/mesh.ts';
import { buildCrystals, buildPlants, buildRock } from '../geometry/buildDecor.ts';
import { buildAdapterTray, buildMovementTray, buildMovementTrayParts } from '../geometry/buildTray.ts';
import type { CrystalParams, PlantParams, RockParams } from '../params/decor.ts';
import {
  defaultCrystalParams,
  defaultPlantParams,
  defaultRockParams,
  validateCrystal,
  validatePlant,
  validateRock,
} from '../params/decor.ts';
import type { AdapterTrayParams, MovementTrayParams } from '../params/trays.ts';
import {
  defaultAdapterTrayParams,
  defaultMovementTrayParams,
  validateAdapterTray,
  validateMovementTray,
} from '../params/trays.ts';
import type { TemplateParams } from '../params/template.ts';
import { defaultTemplateParams, validateTemplate } from '../params/template.ts';
import type { RulerParams } from '../params/ruler.ts';
import { defaultRulerParams, validateRuler } from '../params/ruler.ts';
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
  | { generator: 'adapterTray'; params: AdapterTrayParams }
  | { generator: 'rock'; params: RockParams }
  | { generator: 'crystal'; params: CrystalParams }
  | { generator: 'plants'; params: PlantParams }
  | { generator: 'ruler'; params: RulerParams }
  | { generator: 'template'; params: TemplateParams };

export type GeneratorId = Job['generator'];

export const GENERATOR_LABELS: Record<GeneratorId, string> = {
  base: 'Base',
  movementTray: 'Movement tray',
  adapterTray: 'Adapter tray',
  rock: 'Tactical rock',
  crystal: 'Crystal cluster',
  plants: 'Plants',
  ruler: 'Measuring ruler',
  template: 'Area template',
};

const ERROR_STEP_MESH_ONLY =
  'This generator produces organic mesh geometry and has no STEP form; export STL or 3MF instead.';

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
    case 'rock':
      return { generator, params: defaultRockParams() };
    case 'crystal':
      return { generator, params: defaultCrystalParams() };
    case 'plants':
      return { generator, params: defaultPlantParams() };
    case 'ruler':
      return { generator, params: defaultRulerParams() };
    case 'template':
      return { generator, params: defaultTemplateParams() };
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
    case 'rock':
      return validateRock(job.params);
    case 'crystal':
      return validateCrystal(job.params);
    case 'plants':
      return validatePlant(job.params);
    case 'ruler':
      return validateRuler(job.params);
    case 'template':
      return validateTemplate(job.params);
  }
}

export async function buildJobMesh(wasm: ManifoldToplevel, job: Job): Promise<Manifold> {
  switch (job.generator) {
    case 'base': {
      const font =
        job.params.lettering !== null ? await ensureFont(job.params.lettering.font) : null;
      return buildBaseSingleSolid(wasm, job.params, font);
    }
    case 'movementTray': {
      if (job.params.accent === null) {
        return buildMovementTray(wasm, job.params);
      }
      const { body, accent } = buildMovementTrayParts(wasm, job.params);
      if (accent === null) {
        return body;
      }
      const merged = body.add(accent);
      body.delete();
      accent.delete();
      return merged;
    }
    case 'adapterTray':
      return buildAdapterTray(wasm, job.params);
    case 'rock':
      return buildRock(wasm, job.params);
    case 'crystal':
      return buildCrystals(wasm, job.params);
    case 'plants':
      return buildPlants(wasm, job.params);
    case 'ruler': {
      const { buildRulerParts } = await import('../geometry/buildRuler.ts');
      const font = await ensureFont(job.params.font);
      const parts = buildRulerParts(wasm, job.params, font);
      const solids = parts.map((part) => part.solid);
      const merged = wasm.Manifold.union(solids);
      for (const solid of solids) {
        solid.delete();
      }
      return merged;
    }
    case 'template': {
      const { buildTemplateParts } = await import('../geometry/buildTemplate.ts');
      const parts = buildTemplateParts(wasm, job.params);
      const solids = parts.map((part) => part.solid);
      const merged = wasm.Manifold.union(solids);
      for (const solid of solids) {
        solid.delete();
      }
      return merged;
    }
  }
}

export interface JobPart {
  name: string;
  colorHex: string;
  mesh: RawMesh;
  group?: string;
}

export interface JobStats {
  volumeMm3: number;
  triangles: number;
  vertices: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  overhangAreaMm2: number;
}

export interface JobBundle {
  parts: JobPart[];
  stats: JobStats;
  overhangOverlay: RawMesh | null;
}

const BODY_COLOR = '#1A1A1A';

function mergeOverlays(overlays: RawMesh[]): RawMesh | null {
  if (overlays.length === 0) {
    return null;
  }
  if (overlays.length === 1) {
    return overlays[0];
  }
  const totalPositions = overlays.reduce((acc, m) => acc + m.positions.length, 0);
  const totalIndices = overlays.reduce((acc, m) => acc + m.indices.length, 0);
  const positions = new Float32Array(totalPositions);
  const indices = new Uint32Array(totalIndices);
  let posOffset = 0;
  let idxOffset = 0;
  for (const overlay of overlays) {
    positions.set(overlay.positions, posOffset);
    for (let i = 0; i < overlay.indices.length; i++) {
      indices[idxOffset + i] = overlay.indices[i] + posOffset / 3;
    }
    posOffset += overlay.positions.length;
    idxOffset += overlay.indices.length;
  }
  return { positions, indices };
}

/**
 * Builds all printable parts of a job plus overall statistics. Most jobs
 * are a single part; a base with rim lettering yields the body plus the
 * letter solids so slicers and the preview can color them separately.
 */
export async function buildJobBundle(wasm: ManifoldToplevel, job: Job): Promise<JobBundle> {
  const solids: { name: string; colorHex: string; solid: Manifold; group?: string }[] = [];
  try {
    if (job.generator === 'base' && (job.params.lettering !== null || job.params.plaque !== null)) {
      const lettering = job.params.lettering;
      const font = lettering !== null ? await ensureFont(lettering.font) : null;
      if (job.params.plaque !== null) {
        const sideLetters = lettering !== null && lettering.placement === 'side';
        solids.push({
          name: 'body',
          colorHex: BODY_COLOR,
          solid: buildBase(
            wasm,
            { ...job.params, plaque: null, lettering: sideLetters ? null : lettering },
            sideLetters ? null : font,
          ),
        });
        solids.push({
          name: 'plaque',
          colorHex: job.params.plaque.colorHex,
          solid: buildPlaqueSolidLettered(wasm, job.params, font),
        });
      } else {
        solids.push({ name: 'body', colorHex: BODY_COLOR, solid: buildBase(wasm, job.params, font) });
      }
      if (lettering !== null && font !== null && lettering.style !== 'recessed') {
        solids.push({
          name: 'lettering',
          colorHex: lettering.colorHex,
          solid: buildLetterSolids(wasm, job.params, font),
        });
      }
    } else if (job.generator === 'ruler') {
      const { buildRulerParts } = await import('../geometry/buildRuler.ts');
      const font = await ensureFont(job.params.font);
      for (const part of buildRulerParts(wasm, job.params, font)) {
        solids.push({
          name: part.name,
          colorHex: part.accent ? job.params.accentColorHex : BODY_COLOR,
          solid: part.solid,
          group: part.group,
        });
      }
    } else if (job.generator === 'template') {
      const { buildTemplateParts } = await import('../geometry/buildTemplate.ts');
      for (const part of buildTemplateParts(wasm, job.params)) {
        solids.push({
          name: part.name,
          colorHex: part.accent ? job.params.accentColorHex : BODY_COLOR,
          solid: part.solid,
        });
      }
    } else if (job.generator === 'movementTray' && job.params.accent !== null) {
      const { body, accent } = buildMovementTrayParts(wasm, job.params);
      solids.push({ name: 'tray', colorHex: BODY_COLOR, solid: body });
      if (accent !== null) {
        solids.push({ name: 'accent', colorHex: job.params.accent.colorHex, solid: accent });
      }
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
    let overhangArea = 0;
    const overlays: RawMesh[] = [];
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
      const analysis = analyzeOverhangs(mesh);
      overhangArea += analysis.overhangAreaMm2;
      if (analysis.overlay !== null) {
        overlays.push(analysis.overlay);
      }
      parts.push({ name: entry.name, colorHex: entry.colorHex, mesh, group: entry.group });
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
        overhangAreaMm2: overhangArea,
      },
      overhangOverlay: mergeOverlays(overlays),
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
      const { applyStepLettering, buildStepLetterParts, buildStepShape } = await import(
        '../geometry/step/buildStepShape.ts'
      );
      const font =
        job.params.lettering !== null ? await ensureFont(job.params.lettering.font) : null;
      const hasLetters = job.params.lettering !== null && font !== null;
      const parts: Shape3D[] = [buildStepShape(job.params, font)];
      let letterReference: Shape3D | null = null;
      if (job.params.plaque !== null) {
        const { buildStepPlaque } = await import('../geometry/step/buildStepPlaque.ts');
        const { baseBottomOutline } = await import('../geometry/buildBase.ts');
        const plaqueRaw = buildStepPlaque(job.params, baseBottomOutline(job.params));
        if (plaqueRaw !== null) {
          if (hasLetters) {
            const bare = buildStepShape({ ...job.params, lettering: null });
            letterReference = bare.fuse(plaqueRaw.clone());
            parts.push(applyStepLettering(plaqueRaw, job.params, font));
          } else {
            parts.push(plaqueRaw);
          }
        }
      }
      if (hasLetters) {
        const letters = buildStepLetterParts(
          job.params,
          font,
          letterReference,
        );
        if (letters !== null) {
          parts.push(letters);
        }
      }
      if (parts.length > 1) {
        const { makeCompound } = await import('replicad');
        return makeCompound(parts) as unknown as Shape3D;
      }
      return parts[0];
    }
    case 'movementTray': {
      const { buildStepMovementTray } = await import('../geometry/step/buildStepTray.ts');
      return buildStepMovementTray(job.params);
    }
    case 'adapterTray': {
      const { buildStepAdapterTray } = await import('../geometry/step/buildStepTray.ts');
      return buildStepAdapterTray(job.params);
    }
    case 'rock':
    case 'crystal':
    case 'plants':
    case 'ruler':
    case 'template':
      throw new Error(ERROR_STEP_MESH_ONLY);
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
    case 'rock':
      return `rock-${job.params.sizeMm}-s${job.params.seed}.${extension}`;
    case 'crystal':
      return `crystals-${job.params.count}-s${job.params.seed}.${extension}`;
    case 'plants':
      return `${job.params.variety}-${job.params.count}-s${job.params.seed}.${extension}`;
    case 'ruler':
      return job.params.variant === 'stick'
        ? `ruler-${job.params.units}x${job.params.unitLengthMm}.${extension}`
        : `ruler-chain-${job.params.units}x${job.params.unitLengthMm}.${extension}`;
    case 'template':
      return job.params.variant === 'round'
        ? `template-blast-${job.params.diameterMm}.${extension}`
        : `template-flame-${job.params.lengthMm}x${job.params.widthMm}.${extension}`;
  }
}
