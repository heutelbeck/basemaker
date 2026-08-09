import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { makeNoise2d } from '../params/noise.ts';
import type { Rng } from '../params/random.ts';
import { range } from '../params/random.ts';
import type { Track } from './dispose.ts';

/** Ring resolution around the mushroom axis. */
const U = 144;

interface Ring {
  /** Radius at each azimuth sample. */
  r: (theta: number) => number;
  /** Height at each azimuth sample. */
  z: (theta: number) => number;
}

/**
 * Ultra-detail toadstool for resin printing, built as one closed displaced
 * surface of revolution rather than a clean revolve. Real morphology is
 * modeled directly: a bulbous base, a gently curved striated stem, an
 * optional frilly annulus skirt, a corrugated gill underside, a wavy
 * irregular cap margin, and a noise-textured cap in one of several shapes
 * (convex, bell, umbonate, or flat) with an off-center tendency. Overhangs
 * are intentional; this targets resin printers.
 */
export function mushroomSolid(
  wasm: ManifoldToplevel,
  track: Track,
  rng: Rng,
  heightMm: number,
): Manifold {
  const noise = makeNoise2d(Math.floor(rng() * 1_000_000) + 7);
  const stemH = heightMm * range(rng, 0.5, 0.64);
  const capH = heightMm - stemH;
  const capR = heightMm * range(rng, 0.3, 0.46);
  const stemR = Math.max(0.45, capR * range(rng, 0.26, 0.38));
  const bulbR = stemR * range(rng, 1.35, 1.7);
  const bulbH = stemH * 0.2;
  const bendMag = heightMm * range(rng, 0.03, 0.11);
  const bendDir = range(rng, 0, Math.PI * 2);
  const hasSkirt = rng() < 0.65;
  const skirtZ = stemH * range(rng, 0.55, 0.72);
  const skirtDrop = stemR * range(rng, 0.9, 1.4);
  const skirtR = stemR * range(rng, 1.7, 2.1);
  const skirtWaves = 5 + Math.floor(rng() * 4);
  const skirtPhase = range(rng, 0, Math.PI * 2);
  const gillCount = 22 + Math.floor(rng() * 12);
  const gillDepth = Math.min(0.3, capR * 0.09);
  const marginSag = capH * range(rng, 0.06, 0.16);
  const marginThickness = Math.max(0.22, capR * 0.07);
  const capType = ['convex', 'bell', 'umbonate', 'flat'][Math.floor(rng() * 4)];
  const umboH = capType === 'umbonate' ? capH * range(rng, 0.25, 0.45) : 0;
  const umboR = capR * range(rng, 0.2, 0.32);
  const m1 = range(rng, 0, Math.PI * 2);
  const m2 = range(rng, 0, Math.PI * 2);
  const striationPhase = range(rng, 0, Math.PI * 2);
  const warts: { theta: number; radius: number; size: number; height: number }[] = [];
  const wartCount = 7 + Math.floor(rng() * 9);
  for (let w = 0; w < wartCount; w++) {
    warts.push({
      theta: range(rng, 0, Math.PI * 2),
      radius: capR * range(rng, 0.15, 0.85),
      size: capR * range(rng, 0.08, 0.16),
      height: capR * range(rng, 0.045, 0.1),
    });
  }

  const bend = (z: number): [number, number] => {
    const t = Math.min(z / stemH, 1);
    const amount = bendMag * t * t;
    return [amount * Math.cos(bendDir), amount * Math.sin(bendDir)];
  };
  const marginR = (theta: number): number =>
    capR *
    (1 +
      0.07 * Math.sin(3 * theta + m1) +
      0.045 * Math.sin(7 * theta + m2) +
      0.06 * (noise.fbm(Math.cos(theta) * 1.7 + 3.1, Math.sin(theta) * 1.7, 2) - 0.5));
  const stemProfile = (z: number, theta: number): number => {
    const bulb = bulbR + (stemR - bulbR) * Math.min(z / bulbH, 1);
    const shaft = z <= bulbH ? bulb : stemR * (1 - 0.06 * ((z - bulbH) / (stemH - bulbH)));
    const striation = 1 + 0.035 * Math.sin(9 * theta + striationPhase) + 0.03 * (noise.fbm(theta * 1.2, z * 0.7, 2) - 0.5);
    return shaft * striation;
  };
  const capDome = (t: number): number => {
    switch (capType) {
      case 'bell':
        return Math.pow(Math.sin((t * Math.PI) / 2), 0.65);
      case 'flat':
        return 0.45 * Math.sin((t * Math.PI) / 2);
      default:
        return Math.sin((t * Math.PI) / 2);
    }
  };

  const rings: Ring[] = [];
  rings.push({ r: () => bulbR, z: () => 0 });
  for (let i = 1; i <= 5; i++) {
    const z = (bulbH * i) / 5;
    rings.push({ r: (theta) => stemProfile(z, theta), z: () => z });
  }
  const skirtBottomZ = Math.max(bulbH + 0.2, skirtZ - skirtDrop * 1.05);
  const stemTopOfLower = hasSkirt ? skirtBottomZ : stemH;
  for (let i = 1; i <= 12; i++) {
    const z = bulbH + ((stemTopOfLower - bulbH) * i) / 12;
    rings.push({ r: (theta) => stemProfile(z, theta), z: () => z });
  }
  if (hasSkirt) {
    const skirtEdgeZ = (theta: number): number =>
      skirtZ -
      skirtDrop *
        (0.2 + 0.16 * Math.sin(skirtWaves * theta + skirtPhase) + 0.07 * Math.sin(13 * theta));
    for (let i = 1; i <= 7; i++) {
      const t = i / 7;
      rings.push({
        r: (theta) => stemProfile(skirtBottomZ, theta) + (skirtR - stemR) * Math.pow(t, 1.35),
        z: (theta) => skirtBottomZ + (skirtEdgeZ(theta) - skirtBottomZ) * t,
      });
    }
    rings.push({
      r: (theta) => stemProfile(skirtZ, theta) + (skirtR - stemR) * 0.55,
      z: () => skirtZ + 0.18,
    });
    rings.push({
      r: (theta) => stemProfile(skirtZ, theta) * 1.03,
      z: () => skirtZ + 0.3,
    });
    for (let i = 1; i <= 7; i++) {
      const z = skirtZ + 0.3 + ((stemH - skirtZ - 0.3) * i) / 7;
      rings.push({ r: (theta) => stemProfile(z, theta), z: () => z });
    }
  }
  const gill = (theta: number): number => 0.5 + 0.5 * Math.sin(gillCount * theta);
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    rings.push({
      r: (theta) => stemR + (marginR(theta) - stemR) * t,
      z: (theta) => stemH - marginSag * t - gillDepth * gill(theta) * Math.pow(t, 0.7),
    });
  }
  rings.push({
    r: (theta) => marginR(theta) * 1.09,
    z: (theta) => stemH - marginSag - gillDepth * gill(theta) + marginThickness * 0.35,
  });
  rings.push({
    r: (theta) => marginR(theta) * 1.07,
    z: (theta) => stemH - marginSag - gillDepth * gill(theta) * 0.4 + marginThickness,
  });
  for (let i = 1; i <= 18; i++) {
    const t = i / 18.9;
    rings.push({
      r: (theta) => marginR(theta) * Math.pow(Math.cos((t * Math.PI) / 2), 0.85),
      z: (theta) => {
        const rHere = marginR(theta) * Math.pow(Math.cos((t * Math.PI) / 2), 0.85);
        const umbo = umboH * Math.exp(-(rHere * rHere) / (umboR * umboR));
        const lumps =
          0.11 * capR * (noise.fbm(rHere * Math.cos(theta) * 0.22 + 11, rHere * Math.sin(theta) * 0.22, 2) - 0.5);
        let wartBumps = 0;
        for (const wart of warts) {
          const dSq =
            rHere * rHere +
            wart.radius * wart.radius -
            2 * rHere * wart.radius * Math.cos(theta - wart.theta);
          wartBumps += wart.height * Math.exp(-dSq / (wart.size * wart.size));
        }
        return (
          stemH -
          marginSag +
          marginThickness +
          (capH - marginThickness + marginSag) * capDome(t) +
          umbo +
          lumps +
          wartBumps
        );
      },
    });
  }

  const positions: number[] = [];
  const ringStart: number[] = [];
  for (const ring of rings) {
    ringStart.push(positions.length / 3);
    for (let j = 0; j < U; j++) {
      const theta = (2 * Math.PI * j) / U;
      const radius = ring.r(theta);
      const z = ring.z(theta);
      const [bx, by] = bend(Math.min(z, stemH));
      positions.push(bx + radius * Math.cos(theta), by + radius * Math.sin(theta), z);
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, 0, 0);
  const apexZ = stemH - marginSag + marginThickness + (capH - marginThickness + marginSag) + umboH;
  const [ax, ay] = bend(stemH);
  const apex = positions.length / 3;
  positions.push(ax, ay, apexZ);

  const triangles: number[] = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = ringStart[i];
    const b = ringStart[i + 1];
    for (let j = 0; j < U; j++) {
      const j1 = (j + 1) % U;
      triangles.push(a + j, b + j1, b + j, a + j, a + j1, b + j1);
    }
  }
  const base = ringStart[0];
  for (let j = 0; j < U; j++) {
    triangles.push(bottomCenter, base + (j + 1) % U, base + j);
  }
  const last = ringStart[rings.length - 1];
  for (let j = 0; j < U; j++) {
    triangles.push(apex, last + j, last + (j + 1) % U);
  }

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(positions),
    triVerts: new Uint32Array(triangles),
  });
  mesh.merge();
  return track(wasm.Manifold.ofMesh(mesh));
}
