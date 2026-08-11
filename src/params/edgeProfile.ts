/**
 * Side profile of a base or tray in (inset, z) space: a straight taper by
 * `edgeSlope` from the bottom rim, optionally finished with a convex
 * quarter-round lip of radius `lipRadius` that rolls the wall over into the
 * top face. A lip radius larger than the height switches to a truncated
 * arc: one circle spanning the whole side from the bottom rim, leaving the
 * wall still rising where the top face cuts it off (the profile of
 * Warmachine style lipped bases). All functions are pure math so
 * validation, mesh generation, and B-rep generation share one definition.
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
  endAngle: number;
  tangentZ: number;
}

/**
 * Extra sampling refinement for the lip arc relative to the outline chord
 * tolerance: the arc's facet bands run horizontally around the whole base
 * and catch the light, so they need a much finer sagitta than the
 * silhouette to disappear.
 */
const ARC_TOL_RATIO = 8;

function lipArc(height: number, edgeSlope: number, lipRadius: number): LipArc {
  const hypotenuse = Math.hypot(height, edgeSlope);
  if (lipRadius > height) {
    const centerInset = (lipRadius * height) / hypotenuse;
    const centerZ = (-lipRadius * edgeSlope) / hypotenuse;
    return {
      centerInset,
      centerZ,
      startAngle: Math.atan2(edgeSlope, height),
      endAngle: Math.asin(Math.min(1, (height - centerZ) / lipRadius)),
      tangentZ: 0,
    };
  }
  const centerInset = (edgeSlope * (height - lipRadius) + lipRadius * hypotenuse) / height;
  return {
    centerInset,
    centerZ: height - lipRadius,
    startAngle: Math.atan2(edgeSlope, height),
    endAngle: Math.PI / 2,
    tangentZ: height - lipRadius + (lipRadius * edgeSlope) / hypotenuse,
  };
}

/** True when the arc cut off by the top face still reaches the top. */
export function lipArcReachesTop(height: number, edgeSlope: number, lipRadius: number): boolean {
  if (lipRadius <= height) {
    return true;
  }
  const hypotenuse = Math.hypot(height, edgeSlope);
  return height + (lipRadius * edgeSlope) / hypotenuse <= lipRadius;
}

/** Total inset of the top face relative to the bottom rim. */
export function topInsetFor(height: number, edgeSlope: number, lipRadius: number): number {
  if (lipRadius <= 0) {
    return edgeSlope;
  }
  const arc = lipArc(height, edgeSlope, lipRadius);
  if (lipRadius > height) {
    const dz = height - arc.centerZ;
    return arc.centerInset - Math.sqrt(Math.max(0, lipRadius * lipRadius - dz * dz));
  }
  return arc.centerInset;
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
 * chord error stays well within `tolMm`. The profile is convex, so a
 * convex hull over rings at these samples reproduces it within tolerance.
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
  const arcTol = tolMm / ARC_TOL_RATIO;
  const cosHalf = Math.max(-1, 1 - arcTol / lipRadius);
  const maxStep = Math.max(2 * Math.acos(cosHalf), 1e-6);
  const steps = Math.max(3, Math.ceil((arc.endAngle - arc.startAngle) / maxStep));
  const samples: EdgeProfileSample[] = arc.tangentZ > 0 ? [{ inset: 0, z: 0 }] : [];
  for (let i = 0; i <= steps; i++) {
    const angle = arc.startAngle + ((arc.endAngle - arc.startAngle) * i) / steps;
    samples.push({
      inset: arc.centerInset - lipRadius * Math.cos(angle),
      z: Math.min(height, Math.max(0, arc.centerZ + lipRadius * Math.sin(angle))),
    });
  }
  return { height, edgeSlope, lipRadius, topInset, samples };
}
