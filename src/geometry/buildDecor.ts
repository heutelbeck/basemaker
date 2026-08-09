import type { Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d';
import type { CrystalParams, PlantParams, RockParams } from '../params/decor.ts';
import { PRINT_PROFILES } from '../params/decor.ts';
import type { Noise2d } from '../params/noise.ts';
import { makeNoise2d } from '../params/noise.ts';
import type { Rng } from '../params/random.ts';
import { range, seededRng } from '../params/random.ts';
import { heightfieldBlock } from './heightfield.ts';
import { mushroomSolid } from './mushroom.ts';
import { withGeometryScope } from './dispose.ts';
import type { Track } from './dispose.ts';
import type { Point2 } from '../params/tessellation.ts';
import { segmentsFor } from '../params/tessellation.ts';

const ERROR_INVALID_DECOR = 'The generated decoration is not a valid manifold: ';

const PAD_HEIGHT = 1;
/** Members sink this far into the pad so nothing starts in mid-air. */
const EMBED = 0.5;
function checked(solid: Manifold): Manifold {
  const status = solid.status();
  if (status !== 'NoError') {
    throw new Error(`${ERROR_INVALID_DECOR}${status}.`);
  }
  return solid;
}

/**
 * Organic ground blob: an irregular pad with a pillowed edge, gentle
 * surface undulation, and a scatter of half-buried pebble bumps, like a
 * sculpted scenic base tab.
 */
function basePad(wasm: ManifoldToplevel, track: Track, rng: Rng, radius: number, tolMm: number): Manifold {
  const noise = makeNoise2d(Math.floor(rng() * 1_000_000) + 3);
  const a1 = range(rng, 0.08, 0.16);
  const a2 = range(rng, 0.05, 0.1);
  const p1 = range(rng, 0, Math.PI * 2);
  const p2 = range(rng, 0, Math.PI * 2);
  const blobRadius = (theta: number) =>
    radius * (1 + a1 * Math.sin(2 * theta + p1) + a2 * Math.sin(3 * theta + p2));
  const pebbles: { x: number; y: number; size: number; height: number }[] = [];
  const pebbleCount = Math.floor(radius * 1.2);
  for (let i = 0; i < pebbleCount; i++) {
    const pr = radius * 0.75 * Math.sqrt(rng());
    const pa = range(rng, 0, Math.PI * 2);
    pebbles.push({
      x: pr * Math.cos(pa),
      y: pr * Math.sin(pa),
      size: range(rng, 0.5, 1.1),
      height: range(rng, 0.2, 0.45),
    });
  }
  const heightAt = (x: number, y: number): number => {
    const r = Math.hypot(x, y);
    const theta = Math.atan2(y, x);
    const u = r / Math.max(blobRadius(theta), 0.01);
    if (u >= 1) {
      return 0.05;
    }
    const t = Math.min((1 - u) / 0.3, 1);
    const pillow = Math.sqrt(t * (2 - t));
    let bumps = 0;
    for (const pebble of pebbles) {
      const dSq = (x - pebble.x) * (x - pebble.x) + (y - pebble.y) * (y - pebble.y);
      bumps += pebble.height * Math.exp(-dSq / (pebble.size * pebble.size));
    }
    const undulation = 0.12 * (noise.fbm(x / (radius * 0.6), y / (radius * 0.6), 2) - 0.5);
    return PAD_HEIGHT * pillow * (1 + undulation) + bumps * pillow;
  };
  const padGrid = Math.min(300, Math.max(96, Math.ceil((radius * 2.5) / 0.16)));
  const block = heightfieldBlock(wasm, track, radius * 1.25, heightAt, padGrid);
  const outline: [number, number][] = [];
  const n = segmentsFor(radius, tolMm);
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const r = blobRadius(t);
    outline.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  const clip = track(wasm.Manifold.extrude([outline], PAD_HEIGHT * 3));
  return track(block.intersect(clip));
}

function smoothstep(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/** Rejection-sampled scatter with a minimum separation between items. */
function scatter(rng: Rng, count: number, spread: number, minDistance: number): Point2[] {
  const placed: Point2[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = spread * Math.sqrt(rng());
      const a = range(rng, 0, Math.PI * 2);
      const candidate: Point2 = [r * Math.cos(a), r * Math.sin(a)];
      const clear = placed.every(
        ([x, y]) => Math.hypot(candidate[0] - x, candidate[1] - y) >= minDistance,
      );
      if (clear) {
        placed.push(candidate);
        break;
      }
    }
  }
  return placed;
}

/**
 * Tactical rock as a sculpted boulder: a radial displacement field over a
 * tall ellipsoid, star-shaped from its center so the surface can bulge
 * and undercut without ever self-intersecting. Gaussian lobes give the
 * stacked-boulder massing, sharpened ridge noise carves crevice seams
 * between the lobes, and fine noise roughens the faces. The bottom is
 * plane-cut flat for gluing and the top is plane-cut into a level
 * mounting plateau of roughly the requested diameter.
 */
export function buildRock(wasm: ManifoldToplevel, params: RockParams): Manifold {
  return withGeometryScope((track) => {
    const rng = seededRng(params.seed);

    interface Lobe {
      dir: Vec3;
      amplitude: number;
      sigma: number;
    }

    interface PlateauBlend {
      zCut: number;
      blend: number;
      noise: Noise2d;
    }

    const smoothMin = (a: number, b: number, k: number): number => {
      const h = Math.max(0, k - Math.abs(a - b)) / k;
      return Math.min(a, b) - (h * h * k) / 4;
    };

    const domeMesh = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      rz: number,
      flatConeCos: number | null,
      plateau: PlateauBlend | null,
      rows: number,
      cols: number,
    ): Manifold => {
      const noise = makeNoise2d(Math.floor(rng() * 1_000_000) + 17);
      const detail = makeNoise2d(Math.floor(rng() * 1_000_000) + 5);
      const centerZ = rz * 0.02;
      const meanR = (rx + ry + rz) / 3;
      const lobes: Lobe[] = [];
      const lobeCount = 8 + Math.floor(rng() * 7);
      for (let i = 0; i < lobeCount; i++) {
        const azimuth = range(rng, 0, Math.PI * 2);
        const polar = Math.acos(range(rng, -0.6, 0.95));
        lobes.push({
          dir: [
            Math.sin(polar) * Math.cos(azimuth),
            Math.sin(polar) * Math.sin(azimuth),
            Math.cos(polar),
          ],
          amplitude: meanR * range(rng, 0.08, 0.34) * (0.4 + 0.6 * params.irregularity),
          sigma: range(rng, 0.35, 0.9),
        });
      }
      const creviceDepth = meanR * 0.17 * (0.4 + 0.8 * params.irregularity);
      const fineCreviceDepth = meanR * 0.09 * (0.4 + 0.8 * params.irregularity);

      const sphereNoise = (ux: number, uy: number, uz: number, frequency: number, octaves: number) =>
        (noise.fbm((ux + 2.1) * frequency, (uy - 1.3) * frequency, octaves) +
          noise.fbm((uy + 4.7) * frequency, (uz + 0.9) * frequency, octaves) +
          noise.fbm((uz + 7.3) * frequency, (ux - 3.7) * frequency, octaves)) /
        3;
      const sphereRidged = (ux: number, uy: number, uz: number, frequency: number, octaves: number) =>
        (noise.ridged((ux + 5.2) * frequency, (uy + 1.9) * frequency, octaves) +
          noise.ridged((uy - 3.4) * frequency, (uz + 6.1) * frequency, octaves) +
          noise.ridged((uz + 0.7) * frequency, (ux + 8.9) * frequency, octaves)) /
        3;

      const radiusAt = (ux: number, uy: number, uz: number): number => {
        const base = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry) + (uz * uz) / (rz * rz));
        let displacement = 0;
        for (const lobe of lobes) {
          const dot = ux * lobe.dir[0] + uy * lobe.dir[1] + uz * lobe.dir[2];
          const angle = Math.acos(Math.min(Math.max(dot, -1), 1));
          displacement += lobe.amplitude * Math.exp(-(angle * angle) / (lobe.sigma * lobe.sigma));
        }
        const seam = sphereNoise(ux, uy, uz, 1.7, 3);
        displacement -= creviceDepth * Math.pow(1 - Math.abs(2 * seam - 1), 2.5);
        const fineSeam = sphereNoise(ux, uy, uz, 3.1, 2);
        displacement -= fineCreviceDepth * Math.pow(1 - Math.abs(2 * fineSeam - 1), 3);
        displacement +=
          meanR * 0.3 * params.jaggedness * (sphereRidged(ux, uy, uz, 2.4, 3) - 0.5);
        displacement +=
          meanR *
          0.05 *
          (detail.fbm((ux + 1) * 5.1, (uy + uz) * 5.1, 3) - 0.5) *
          (0.5 + params.irregularity);
        const damp =
          flatConeCos !== null && uz > flatConeCos
            ? 1 - smoothstep((uz - flatConeCos) / (1 - flatConeCos))
            : 1;
        const displaced = Math.max(base + displacement * damp, meanR * 0.25);
        if (plateau === null || uz <= 0.05) {
          return displaced;
        }
        const planeSpan = plateau.zCut - centerZ;
        const gx = (ux / uz) * planeSpan;
        const gy = (uy / uz) * planeSpan;
        const grain = 0.24 * (plateau.noise.fbm(gx / 1.6, gy / 1.6, 3) - 0.5);
        const planeRadius = (planeSpan + grain) / uz;
        return smoothMin(displaced, planeRadius, plateau.blend);
      };

      const positions: number[] = [];
      const ringStart: number[] = [];
      for (let i = 1; i < rows; i++) {
        const phi = (Math.PI * i) / rows;
        ringStart.push(positions.length / 3);
        for (let j = 0; j < cols; j++) {
          const theta = (2 * Math.PI * j) / cols;
          const ux = Math.sin(phi) * Math.cos(theta);
          const uy = Math.sin(phi) * Math.sin(theta);
          const uz = Math.cos(phi);
          const r = radiusAt(ux, uy, uz);
          positions.push(cx + ux * r, cy + uy * r, centerZ + uz * r);
        }
      }
      const topPole = positions.length / 3;
      positions.push(cx, cy, centerZ + radiusAt(0, 0, 1));
      const bottomPole = positions.length / 3;
      positions.push(cx, cy, centerZ - radiusAt(0, 0, -1));

      const triangles: number[] = [];
      for (let i = 0; i + 1 < ringStart.length; i++) {
        const a = ringStart[i];
        const b = ringStart[i + 1];
        for (let j = 0; j < cols; j++) {
          const j1 = (j + 1) % cols;
          triangles.push(a + j, b + j, b + j1, a + j, b + j1, a + j1);
        }
      }
      const first = ringStart[0];
      const last = ringStart[ringStart.length - 1];
      for (let j = 0; j < cols; j++) {
        const j1 = (j + 1) % cols;
        triangles.push(topPole, first + j, first + j1);
        triangles.push(bottomPole, last + j1, last + j);
      }
      const mesh = new wasm.Mesh({
        numProp: 3,
        vertProperties: new Float32Array(positions),
        triVerts: new Uint32Array(triangles),
      });
      mesh.merge();
      return track(wasm.Manifold.ofMesh(mesh));
    };

    const rxMain = (params.sizeMm / 2) * range(rng, 0.8, 1.1);
    const ryMain = (params.sizeMm / 2) * range(rng, 0.65, 1.05);
    const flatHalf = Math.min(params.flatSpotDiameter / 2 + 0.4, Math.min(rxMain, ryMain) * 0.9);
    const dropFraction = Math.min(
      0.5,
      1 - Math.sqrt(1 - Math.pow(flatHalf / Math.min(rxMain, ryMain), 2)),
    );
    const rzMain = (params.heightMm / (1 - dropFraction)) * 0.98;
    const mainConeCos = Math.cos(Math.atan2(flatHalf + 1.5, rzMain * (1 - dropFraction)));
    const zCut = rzMain * 0.02 + rzMain * (1 - dropFraction);
    const plateau: PlateauBlend = {
      zCut,
      blend: Math.min(2.5, Math.max(1.2, flatHalf * 0.6)),
      noise: makeNoise2d(params.seed * 31 + 7),
    };
    const main = domeMesh(0, 0, rxMain, ryMain, rzMain, mainConeCos, plateau, 180, 360);
    const parts = [main];
    let reach = Math.max(rxMain, ryMain);
    const satelliteCount = Math.floor(rng() * 3);
    for (let s = 0; s < satelliteCount; s++) {
      const srx = (params.sizeMm / 2) * range(rng, 0.32, 0.55);
      const sry = srx * range(rng, 0.75, 1.1);
      const srz = params.heightMm * range(rng, 0.45, 0.7);
      const azimuth = range(rng, 0, Math.PI * 2);
      const dist = (rxMain + srx) * range(rng, 0.55, 0.75);
      const satellite = domeMesh(
        dist * Math.cos(azimuth),
        dist * Math.sin(azimuth),
        srx,
        sry,
        srz,
        null,
        null,
        120,
        240,
      );
      parts.push(satellite);
      reach = Math.max(reach, dist + Math.max(srx, sry));
    }
    const boulder = track(wasm.Manifold.union(parts));

    const span = reach * 1.35 + 2;
    const groundProto = track(
      wasm.Manifold.cube([span * 2, span * 2, zCut + params.heightMm + 2], false),
    );
    const ground = track(groundProto.translate(-span, -span, 0));
    return checked(track(boulder.intersect(ground)));
  });
}

/**
 * Crystal druse: shafts radiate from the cluster center like a geode -
 * near vertical in the middle, leaning progressively outward toward the
 * edge - so neighbors grow nearly parallel and only intergrow at their
 * bases instead of crossing at odd angles.
 */
export function buildCrystals(wasm: ManifoldToplevel, params: CrystalParams): Manifold {
  return withGeometryScope((track) => {
    const rng = seededRng(params.seed);
    const tol = params.quality.chordTolMm;
    const solids: Manifold[] = [];
    const padRadius = params.padRadiusMm;
    solids.push(basePad(wasm, track, rng, padRadius, tol));
    const spread = Math.max(params.spreadMm, 0.01);
    const positions = scatter(rng, params.count, spread, params.radiusMm * 1.05);
    for (const [px, py] of positions) {
      const dist = Math.hypot(px, py);
      const radius = params.radiusMm * range(rng, 0.65, 1);
      const height = params.heightMm * (1 - 0.45 * (dist / spread)) * range(rng, 0.85, 1.05);
      const tipHeight = Math.min(height * 0.35, radius * 2.4);
      const shaft = track(
        wasm.Manifold.cylinder(height - tipHeight, radius, radius * 0.84, params.sides, false),
      );
      const tipBase = track(
        wasm.Manifold.cylinder(tipHeight, radius * 0.84, radius * 0.1, params.sides, false),
      );
      const tip = track(tipBase.translate(0, 0, height - tipHeight));
      let crystal = track(shaft.add(tip));
      const tilt = params.maxTiltDeg * Math.pow(dist / spread, 0.8) * range(rng, 0.75, 1.05);
      const leanAzimuth = (Math.atan2(py, px) * 180) / Math.PI + range(rng, -18, 18);
      crystal = track(crystal.rotate(tilt, 0, leanAzimuth + 90));
      const tiltDrop = radius * Math.sin((tilt * Math.PI) / 180);
      solids.push(track(crystal.translate(px, py, PAD_HEIGHT - EMBED - tiltDrop)));
    }
    const cluster = track(wasm.Manifold.union(solids));
    const span = 2 * (padRadius + params.heightMm + 5);
    const groundProto = track(wasm.Manifold.cube([span, span, span], true));
    const ground = track(groundProto.translate(0, 0, span / 2));
    return checked(track(cluster.intersect(ground)));
  });
}

interface Stem {
  points: Vec3[];
  radii: number[];
}

/** Grows a stem leaning a fixed direction, bowing outward toward the tip. */
function growStem(
  start: Vec3,
  height: number,
  baseRadius: number,
  tipRadius: number,
  leanDeg: number,
  azimuthRad: number,
  segments: number,
): Stem {
  const lean = (leanDeg * Math.PI) / 180;
  const points: Vec3[] = [start];
  const radii = [baseRadius];
  let position = start;
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const segmentLean = lean * t;
    const length = height / segments;
    position = [
      position[0] + length * Math.sin(segmentLean) * Math.cos(azimuthRad),
      position[1] + length * Math.sin(segmentLean) * Math.sin(azimuthRad),
      position[2] + length * Math.cos(segmentLean),
    ];
    points.push(position);
    radii.push(baseRadius + (tipRadius - baseRadius) * t);
  }
  return { points, radii };
}

function stemSolids(
  wasm: ManifoldToplevel,
  track: Track,
  stem: Stem,
  tolMm: number,
): Manifold[] {
  const solids: Manifold[] = [];
  const spheres = stem.points.map((point, i) => {
    const radius = Math.max(stem.radii[i], 0.1);
    const sphere = track(wasm.Manifold.sphere(radius, segmentsFor(radius, tolMm)));
    return track(sphere.translate(point[0], point[1], point[2]));
  });
  for (let i = 0; i + 1 < spheres.length; i++) {
    solids.push(track(wasm.Manifold.hull([spheres[i], spheres[i + 1]])));
  }
  return solids;
}

/**
 * Support-free plant tuft. Blades and reeds splay radially outward from
 * the tuft center inside the print profile's lean cone, with minimum
 * separations so members never cross; mushrooms are revolved toadstools.
 */
export function buildPlants(wasm: ManifoldToplevel, params: PlantParams): Manifold {
  return withGeometryScope((track) => {
    const rng = seededRng(params.seed);
    const tol = params.quality.chordTolMm;
    const profile = PRINT_PROFILES[params.profile];
    const solids: Manifold[] = [];
    const padRadius = params.padRadiusMm;
    solids.push(basePad(wasm, track, rng, padRadius, tol));
    const spread = Math.max(params.spreadMm, 0.01);

    if (params.variety === 'mushrooms') {
      const bigCount = Math.max(1, Math.ceil(params.count * 0.4));
      const heights: number[] = [];
      for (let i = 0; i < params.count; i++) {
        const big = i < bigCount;
        heights.push(params.heightMm * (big ? range(rng, 0.7, 1) : range(rng, 0.25, 0.55)));
      }
      heights.sort((a, b) => b - a);
      const capReach = (height: number) => height * 0.66;
      const planned: { x: number; y: number; height: number }[] = [];
      for (const height of heights) {
        const usable = Math.max(0.4, padRadius * 0.7 - height * 0.18);
        let spot: Point2 | null = null;
        for (let attempt = 0; attempt < 90 && spot === null; attempt++) {
          const r = usable * Math.sqrt(rng());
          const a = range(rng, 0, Math.PI * 2);
          const x = r * Math.cos(a);
          const y = r * Math.sin(a);
          const clear = planned.every((other) => {
            const d = Math.hypot(x - other.x, y - other.y);
            const tallest = Math.max(height, other.height);
            const tiered = Math.abs(height - other.height) > 0.35 * tallest;
            const needed = tiered
              ? capReach(Math.min(height, other.height)) + 0.3 * tallest
              : capReach(height) + capReach(other.height);
            return d >= needed;
          });
          if (clear) {
            spot = [x, y];
          }
        }
        if (spot !== null) {
          planned.push({ x: spot[0], y: spot[1], height });
        }
      }
      for (const shroom of planned) {
        const mushroom = mushroomSolid(wasm, track, rng, shroom.height);
        const tilt = range(rng, 0, 7);
        const leanAzimuth = range(rng, 0, 360);
        const placed = track(mushroom.rotate(tilt, 0, leanAzimuth));
        solids.push(track(placed.translate(shroom.x, shroom.y, PAD_HEIGHT - 0.35)));
      }
      return checked(track(wasm.Manifold.union(solids)));
    }

    const tall = params.variety === 'reeds';
    const minSeparation = tall ? 1.5 : 1.1;
    const positions = scatter(rng, params.count, spread, minSeparation);
    for (const [px, py] of positions) {
      const dist = Math.hypot(px, py);
      const height = params.heightMm * range(rng, tall ? 0.7 : 0.5, 1);
      const baseRadius = tall ? 0.55 : 0.5;
      const tipRadius = Math.max(profile.minRadius, tall ? 0.3 : profile.minRadius);
      const leanLimit = tall ? Math.min(profile.maxLeanDeg, 12) : profile.maxLeanDeg;
      const lean = leanLimit * Math.pow(dist / spread, 0.9) * range(rng, 0.5, 1);
      const azimuth = Math.atan2(py, px) + range(rng, -0.45, 0.45);
      const anchor: Vec3 = [px, py, Math.max(PAD_HEIGHT - EMBED, baseRadius)];
      const stem = growStem(anchor, height, baseRadius, tipRadius, lean, azimuth, 3);
      solids.push(...stemSolids(wasm, track, stem, tol));
      if (tall && rng() > 0.4) {
        const tip = stem.points[stem.points.length - 1];
        const headRadius = 0.8;
        const headLength = Math.min(2.5, height * 0.25);
        const bottom = track(wasm.Manifold.sphere(headRadius, segmentsFor(headRadius, tol)));
        const bottomAt = track(bottom.translate(tip[0], tip[1], tip[2]));
        const top = track(wasm.Manifold.sphere(headRadius, segmentsFor(headRadius, tol)));
        const topAt = track(top.translate(tip[0], tip[1], tip[2] + headLength));
        solids.push(track(wasm.Manifold.hull([bottomAt, topAt])));
      }
    }
    return checked(track(wasm.Manifold.union(solids)));
  });
}
