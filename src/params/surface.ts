import type { ValidationIssue } from './validate.ts';

/**
 * Procedural relief on the base top face, modeled after real-world
 * groundwork. Cobblestones follow genuine laying patterns (relaxed
 * field-stone joints, running-bond courses, peacock fans) with tight
 * mortar gaps; planks carry grain and worn ends; ponds and craters are
 * irregular blobs with graded floors and raised banks or ejecta rims;
 * cracked earth (type id 'lava' for saved-collection compatibility) is a
 * field of ropey plates split by a wandering crack network. All types
 * rebuild deterministically from their seed.
 */
export type SurfaceParams =
  | {
      type: 'cobblestone';
      pattern: 'random' | 'coursed' | 'fan';
      stoneSize: number;
      gap: number;
      reliefHeight: number;
      domed: boolean;
      seed: number;
    }
  | {
      type: 'planks';
      plankWidth: number;
      gap: number;
      reliefHeight: number;
      angleDeg: number;
      grain: boolean;
      seed: number;
    }
  | {
      type: 'pond';
      count: number;
      depth: number;
      sizeFraction: number;
      roughness: number;
      shoreGradient: boolean;
      seed: number;
    }
  | {
      type: 'craters';
      count: number;
      diameterMm: number;
      depth: number;
      rimHeight: number;
      seed: number;
    }
  | {
      type: 'lava';
      cellSize: number;
      crackWidth: number;
      depth: number;
      seed: number;
    }
  | {
      type: 'steelPlates';
      plateSize: number;
      gap: number;
      reliefHeight: number;
      detail: 'plain' | 'rivets' | 'tread' | 'diamond';
      detailHeight: number;
      seed: number;
    };

/**
 * Basin floor noise carves up to this factor deeper than the nominal
 * depth, so validation and default clamping leave that much headroom.
 */
export const BASIN_DEPTH_HEADROOM = 1.2;

/**
 * Clamps carving depths so the surface fits above the floor limit (the
 * hollow top plate, or the full height on solid bases). Used when a
 * texture is first enabled so defaults are always valid.
 */
export function clampSurfaceDepths(surface: SurfaceParams, floorLimit: number): SurfaceParams {
  const maxDepth = Math.max(0.2, floorLimit / BASIN_DEPTH_HEADROOM - 0.1);
  if (surface.type === 'pond' || surface.type === 'craters' || surface.type === 'lava') {
    return { ...surface, depth: Math.min(surface.depth, maxDepth) };
  }
  return surface;
}

export function defaultSurfaceParams(type: SurfaceParams['type']): SurfaceParams {
  switch (type) {
    case 'cobblestone':
      return {
        type,
        pattern: 'random',
        stoneSize: 4.5,
        gap: 0.25,
        reliefHeight: 0.5,
        domed: false,
        seed: 1,
      };
    case 'planks':
      return { type, plankWidth: 4.5, gap: 0.3, reliefHeight: 0.5, angleDeg: 0, grain: true, seed: 1 };
    case 'pond':
      return { type, count: 1, depth: 1, sizeFraction: 0.5, roughness: 0.35, shoreGradient: true, seed: 1 };
    case 'craters':
      return { type, count: 3, diameterMm: 10, depth: 1.2, rimHeight: 0.5, seed: 1 };
    case 'lava':
      return { type, cellSize: 7, crackWidth: 0.6, depth: 0.7, seed: 1 };
    case 'steelPlates':
      return { type, plateSize: 14, gap: 0.4, reliefHeight: 0.4, detail: 'rivets', detailHeight: 0.2, seed: 1 };
  }
}

const ERROR_SURFACE_COUNT_INVALID = 'The pond or crater count must be a whole number from 1 to 4.';
const ERROR_SURFACE_POND_INVALID =
  'The pond size fraction must be between 0.2 and 0.7, the roughness at most 0.6, and the depth plus its 20 percent noise margin must leave floor material.';
const ERROR_SURFACE_RELIEF_INVALID =
  'The surface relief or engraving depth must be between 0.2 mm and 2 mm.';
const ERROR_SURFACE_SIZES_INVALID =
  'The surface feature size must be positive and larger than its gap or crack width.';

export function validateSurface(
  surface: SurfaceParams,
  height: number,
  hollowTopThickness: number | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reliefOk = (value: number) => value >= 0.2 && value <= 2;
  const floorLimit = hollowTopThickness ?? height;
  switch (surface.type) {
    case 'cobblestone':
      if (!reliefOk(surface.reliefHeight)) {
        issues.push({ code: 'surface-relief', message: ERROR_SURFACE_RELIEF_INVALID });
      }
      if (!(surface.stoneSize > 0) || surface.gap < 0.08 || surface.gap >= surface.stoneSize / 3) {
        issues.push({ code: 'surface-sizes', message: ERROR_SURFACE_SIZES_INVALID });
      }
      break;
    case 'planks':
      if (!reliefOk(surface.reliefHeight)) {
        issues.push({ code: 'surface-relief', message: ERROR_SURFACE_RELIEF_INVALID });
      }
      if (!(surface.plankWidth > 0) || surface.gap < 0.15 || surface.gap >= surface.plankWidth / 3) {
        issues.push({ code: 'surface-sizes', message: ERROR_SURFACE_SIZES_INVALID });
      }
      break;
    case 'pond':
      if (!Number.isInteger(surface.count) || surface.count < 1 || surface.count > 4) {
        issues.push({ code: 'surface-count', message: ERROR_SURFACE_COUNT_INVALID });
      }
      if (
        surface.sizeFraction < 0.2 ||
        surface.sizeFraction > 0.7 ||
        surface.roughness < 0 ||
        surface.roughness > 0.6 ||
        !(surface.depth > 0) ||
        surface.depth * BASIN_DEPTH_HEADROOM > floorLimit
      ) {
        issues.push({ code: 'surface-pond', message: ERROR_SURFACE_POND_INVALID });
      }
      break;
    case 'craters':
      if (!Number.isInteger(surface.count) || surface.count < 1 || surface.count > 4) {
        issues.push({ code: 'surface-count', message: ERROR_SURFACE_COUNT_INVALID });
      }
      if (
        !(surface.diameterMm > 2) ||
        !(surface.depth > 0) ||
        surface.depth * BASIN_DEPTH_HEADROOM > floorLimit ||
        surface.rimHeight < 0 ||
        surface.rimHeight > 2
      ) {
        issues.push({ code: 'surface-relief', message: ERROR_SURFACE_RELIEF_INVALID });
      }
      break;
    case 'lava':
      if (!(surface.depth >= 0.2) || surface.depth > 2 || surface.depth >= floorLimit) {
        issues.push({ code: 'surface-relief', message: ERROR_SURFACE_RELIEF_INVALID });
      }
      if (
        !(surface.cellSize > 0) ||
        !(surface.crackWidth >= 0.3) ||
        surface.crackWidth >= surface.cellSize / 3
      ) {
        issues.push({ code: 'surface-sizes', message: ERROR_SURFACE_SIZES_INVALID });
      }
      break;
    case 'steelPlates':
      if (!reliefOk(surface.reliefHeight) || surface.detailHeight < 0.1 || surface.detailHeight > 1.5) {
        issues.push({ code: 'surface-relief', message: ERROR_SURFACE_RELIEF_INVALID });
      }
      if (!(surface.plateSize > 4) || surface.gap < 0.15 || surface.gap >= surface.plateSize / 4) {
        issues.push({ code: 'surface-sizes', message: ERROR_SURFACE_SIZES_INVALID });
      }
      break;
  }
  return issues;
}
