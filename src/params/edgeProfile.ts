/**
 * Side profile of a base or tray in (inset, z) space: a straight taper by
 * `edgeSlope` from the bottom rim, optionally finished with a convex
 * quarter-round lip of radius `lipRadius` that rolls the wall over into the
 * top face. All functions are pure math so validation, mesh generation, and
 * B-rep generation share one definition.
 */
export interface EdgeProfileSample {
  inset: number;
  z: number;
}

export interface EdgeProfile {
  height: number;
  edgeSlope: number;
  lipRadius: number;
  topInset: number;
  samples: EdgeProfileSample[];
}

interface LipArc {
  centerInset: number;
  centerZ: number;
  startAngle: number;
  tangentZ: number;
}

function lipArc(height: number, edgeSlope: number, lipRadius: number): LipArc {
  const hypotenuse = Math.hypot(height, edgeSlope);
  const centerInset = (edgeSlope * (height - lipRadius) + lipRadius * hypotenuse) / height;
  const startAngle = Math.atan2(edgeSlope, height);
  return {
    centerInset,
    centerZ: height - lipRadius,
    startAngle,
    tangentZ: height - lipRadius + (lipRadius * edgeSlope) / hypotenuse,
  };
}

/** Total inset of the top face relative to the bottom rim. */
export function topInsetFor(height: number, edgeSlope: number, lipRadius: number): number {
  if (lipRadius <= 0) {
    return edgeSlope;
  }
  return lipArc(height, edgeSlope, lipRadius).centerInset;
}

/** Inset of the wall at height `z`, exact on both profile segments. */
export function profileInsetAt(profile: EdgeProfile, z: number): number {
  const { height, edgeSlope, lipRadius } = profile;
  if (lipRadius <= 0) {
    return (edgeSlope * z) / height;
  }
  const arc = lipArc(height, edgeSlope, lipRadius);
  if (z <= arc.tangentZ) {
    return (edgeSlope * z) / height;
  }
  const dz = z - arc.centerZ;
  return arc.centerInset - Math.sqrt(Math.max(0, lipRadius * lipRadius - dz * dz));
}

/**
 * Samples the profile for ring-stack construction. Returns ascending-z
 * samples from the bottom rim to the top face; the arc is sampled so its
 * chord error stays within `tolMm`. The profile is convex, so a convex
 * hull over rings at these samples reproduces it within tolerance.
 */
export function computeEdgeProfile(
  height: number,
  edgeSlope: number,
  lipRadius: number,
  tolMm: number,
): EdgeProfile {
  const topInset = topInsetFor(height, edgeSlope, lipRadius);
  if (lipRadius <= 0) {
    return {
      height,
      edgeSlope,
      lipRadius,
      topInset,
      samples: [
        { inset: 0, z: 0 },
        { inset: edgeSlope, z: height },
      ],
    };
  }
  const arc = lipArc(height, edgeSlope, lipRadius);
  const endAngle = Math.PI / 2;
  const cosHalf = Math.max(-1, 1 - tolMm / lipRadius);
  const maxStep = Math.max(2 * Math.acos(cosHalf), 1e-6);
  const steps = Math.max(3, Math.ceil((endAngle - arc.startAngle) / maxStep));
  const samples: EdgeProfileSample[] = [{ inset: 0, z: 0 }];
  for (let i = 0; i <= steps; i++) {
    const angle = arc.startAngle + ((endAngle - arc.startAngle) * i) / steps;
    samples.push({
      inset: arc.centerInset - lipRadius * Math.cos(angle),
      z: arc.centerZ + lipRadius * Math.sin(angle),
    });
  }
  return { height, edgeSlope, lipRadius, topInset, samples };
}
