import type { ManifoldToplevel } from 'manifold-3d';
import { makeNoise2d } from '../../../params/noise.ts';
import { polygonContains } from '../../../params/polygon.ts';
import type { Rng } from '../../../params/random.ts';
import { range, seededRng } from '../../../params/random.ts';
import type { SurfaceParams } from '../../../params/surface.ts';
import type { Point2 } from '../../../params/tessellation.ts';
import type { Track } from '../../dispose.ts';
import { heightfieldBlock } from '../../heightfield.ts';
import type { SurfaceRelief, TopFace } from './shared.ts';
import { EDGE_MARGIN, faceClip } from './shared.ts';

interface BasinPlan {
  center: Point2;
  radius: number;
  harmonics: { a: number[]; p: number[] };
  depth: number;
  graded: boolean;
  rimHeight: number;
  rimWidth: number;
  rayNoise: number;
  seed: number;
}

function harmonicRadius(plan: BasinPlan, theta: number): number {
  const { a, p } = plan.harmonics;
  return (
    plan.radius *
    (1 +
      a[0] * Math.sin(2 * theta + p[0]) +
      a[1] * Math.sin(3 * theta + p[1]) +
      a[2] * Math.sin(5 * theta + p[2]))
  );
}

function makeBasinPlan(
  rng: Rng,
  center: Point2,
  radius: number,
  roughness: number,
  depth: number,
  graded: boolean,
  rimHeight: number,
  rimWidth: number,
  rayNoise: number,
): BasinPlan {
  return {
    center,
    radius,
    harmonics: {
      a: [
        roughness * range(rng, 0.4, 0.7),
        roughness * range(rng, 0.2, 0.45),
        roughness * range(rng, 0.1, 0.3),
      ],
      p: [range(rng, 0, Math.PI * 2), range(rng, 0, Math.PI * 2), range(rng, 0, Math.PI * 2)],
    },
    depth,
    graded,
    rimHeight,
    rimWidth,
    rayNoise,
    seed: Math.floor(rng() * 1_000_000) + 1,
  };
}

function placeBlob(rng: Rng, face: TopFace, clearance: number): Point2 | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = range(rng, -face.hx, face.hx);
    const y = range(rng, -face.hy, face.hy);
    if (polygonContains(face.outline, x, y, clearance + EDGE_MARGIN)) {
      return [x, y];
    }
  }
  return null;
}

export function basinPlansForPonds(
  surface: Extract<SurfaceParams, { type: 'pond' }>,
  face: TopFace,
): BasinPlan[] {
  const rng = seededRng(surface.seed);
  const plans: BasinPlan[] = [];
  for (let i = 0; i < surface.count; i++) {
    const radius = surface.sizeFraction * Math.min(face.hx, face.hy) * range(rng, 0.75, 1);
    const center = placeBlob(rng, face, radius * 1.35);
    if (center !== null) {
      plans.push(
        makeBasinPlan(
          rng,
          center,
          radius,
          surface.roughness,
          surface.depth,
          surface.shoreGradient,
          0.3,
          0.35,
          0.35,
        ),
      );
    }
  }
  return plans;
}

export function basinPlansForCraters(
  surface: Extract<SurfaceParams, { type: 'craters' }>,
  face: TopFace,
): BasinPlan[] {
  const rng = seededRng(surface.seed);
  const plans: BasinPlan[] = [];
  for (let i = 0; i < surface.count; i++) {
    const radius = (surface.diameterMm / 2) * range(rng, 0.55, 1);
    const center = placeBlob(rng, face, radius * 1.6);
    if (center !== null) {
      plans.push(
        makeBasinPlan(
          rng,
          center,
          radius,
          0.16,
          surface.depth * range(rng, 0.7, 1),
          true,
          surface.rimHeight,
          range(rng, 0.3, 0.45),
          0.85,
        ),
      );
    }
  }
  return plans;
}

/**
 * Ponds and craters as one continuous signed profile: the bowl rises
 * smoothly through zero exactly at the basin boundary and continues into
 * an exponentially decaying rim, so there are no internal vertical walls
 * anywhere. The whole top slab of the face is replaced by a single
 * heightfield carrying the combined field of every basin; the net add and
 * net cut pieces both derive from that one sampled surface, so the shore
 * transition is seamless by construction instead of being stitched at an
 * approximated zero contour.
 */
export function buildBasins(
  wasm: ManifoldToplevel,
  track: Track,
  plans: BasinPlan[],
  face: TopFace,
  height: number,
): SurfaceRelief {
  if (plans.length === 0) {
    return { add: null, cut: null };
  }
  const fields = plans.map((plan) => ({ plan, noise: makeNoise2d(plan.seed) }));
  let maxDepth = 0;
  let maxRim = 0;
  for (const plan of plans) {
    maxDepth = Math.max(maxDepth, plan.depth * 1.2);
    maxRim = Math.max(maxRim, plan.rimHeight * 1.6);
  }
  const deltaFor = (field: (typeof fields)[number], x: number, y: number): number => {
    const { plan, noise } = field;
    const dx = x - plan.center[0];
    const dy = y - plan.center[1];
    const reach = plan.radius * (1 + plan.rimWidth * 6);
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) {
      return 0;
    }
    const r = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    const u = r / Math.max(harmonicRadius(plan, theta), 0.01);
    const featureScale = plan.radius * 0.6;
    const floorNoise = 1 + 0.28 * (noise.fbm(x / featureScale, y / featureScale, 4) - 0.5);
    if (u < 1) {
      const profile = plan.graded ? Math.pow(1 - u * u, 1.15) : Math.min(1, (1 - u) / 0.06);
      return -plan.depth * profile * floorNoise;
    }
    const s = (u - 1) / plan.rimWidth;
    const ray =
      1 -
      plan.rayNoise * 0.5 +
      plan.rayNoise * noise.fbm(Math.cos(theta) * 2.3 + 7.7, Math.sin(theta) * 2.3, 3);
    return plan.rimHeight * s * Math.exp(1 - s) * ray * floorNoise;
  };
  const deltaTotal = (x: number, y: number): number => {
    let delta = 0;
    for (const field of fields) {
      delta += deltaFor(field, x, y);
    }
    return delta;
  };

  const slabDepth = maxDepth + 0.4;
  const half = Math.max(face.hx, face.hy) + 1;
  const gridCells = Math.min(420, Math.max(140, Math.ceil((2 * half) / 0.16)));
  const block = heightfieldBlock(
    wasm,
    track,
    half,
    (x, y) => Math.max(0.05, slabDepth + deltaTotal(x, y)),
    gridCells,
  );
  const placed = track(block.translate(0, 0, height - slabDepth));
  const clipRegion = faceClip(wasm, track, face);
  const clipPrismProto = track(wasm.Manifold.extrude(clipRegion, slabDepth + maxRim + 1));
  const clipPrism = track(clipPrismProto.translate(0, 0, height - slabDepth));
  const newTop = track(placed.intersect(clipPrism));
  const slabProto = track(wasm.Manifold.extrude(clipRegion, slabDepth));
  const slab = track(slabProto.translate(0, 0, height - slabDepth));
  return {
    add: track(newTop.subtract(slab)),
    cut: track(slab.subtract(newTop)),
  };
}
