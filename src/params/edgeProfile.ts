/**
 * Side profile of a base or tray in (inset, z) space: a straight taper by
 * `edgeSlope` from the bottom rim, optionally finished with a convex
 * quarter-round lip of radius `lipRadius` that rolls the wall over into the
 * top face. A lip radius larger than the height switches to a truncated
 * arc: one circle spanning the whole side from the bottom rim, cut off by
 * the top face while still rising (the profile of Warmachine style lipped
 * bases); an optional `lipTopRadius` blends that cut with a smaller arc
 * tangent to the wall and tangent to the top face. All functions are pure
 * math so validation, mesh generation, and B-rep generation share one
 * definition.
 */
export interface EdgeProfileSample {
  inset: number;
  z: number;
}

export interface EdgeProfile {
  height: number;
  edgeSlope: number;
  lipRadius: number;
  lipTopRadius: number;
  topInset: number;
  samples: EdgeProfileSample[];
}

export interface ArcSegment {
  centerInset: number;
  centerZ: number;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface LipShape {
  main: ArcSegment;
  roll: ArcSegment | null;
  tangentZ: number;
}

/** A point on an arc segment at the given angle, in (inset, z) space. */
export function arcPointAt(arc: ArcSegment, angle: number): EdgeProfileSample {
  return {
    inset: arc.centerInset - arc.radius * Math.cos(angle),
    z: arc.centerZ + arc.radius * Math.sin(angle),
  };
}

/**
 * Extra sampling refinement for the lip arcs relative to the outline chord
 * tolerance: the facet bands run horizontally around the whole base and
 * catch the light, so they need a much finer sagitta than the silhouette
 * to disappear.
 */
const ARC_TOL_RATIO = 8;

export function lipShape(
  height: number,
  edgeSlope: number,
  lipRadius: number,
  lipTopRadius: number,
): LipShape {
  const hypotenuse = Math.hypot(height, edgeSlope);
  const startAngle = Math.atan2(edgeSlope, height);
  if (lipRadius > height) {
    const centerInset = (lipRadius * height) / hypotenuse;
    const centerZ = (-lipRadius * edgeSlope) / hypotenuse;
    const roll = Math.min(lipTopRadius, lipRadius);
    if (roll > 0) {
      const sinTangent = Math.min(1, (height - roll - centerZ) / (lipRadius - roll));
      const tangentAngle = Math.asin(sinTangent);
      const cosTangent = Math.cos(tangentAngle);
      return {
        main: {
          centerInset,
          centerZ,
          radius: lipRadius,
          startAngle,
          endAngle: tangentAngle,
        },
        roll: {
          centerInset: centerInset - (lipRadius - roll) * cosTangent,
          centerZ: height - roll,
          radius: roll,
          startAngle: tangentAngle,
          endAngle: Math.PI / 2,
        },
        tangentZ: 0,
      };
    }
    return {
      main: {
        centerInset,
        centerZ,
        radius: lipRadius,
        startAngle,
        endAngle: Math.asin(Math.min(1, (height - centerZ) / lipRadius)),
      },
      roll: null,
      tangentZ: 0,
    };
  }
  const centerInset = (edgeSlope * (height - lipRadius) + lipRadius * hypotenuse) / height;
  return {
    main: {
      centerInset,
      centerZ: height - lipRadius,
      radius: lipRadius,
      startAngle,
      endAngle: Math.PI / 2,
    },
    roll: null,
    tangentZ: height - lipRadius + (lipRadius * edgeSlope) / hypotenuse,
  };
}

/**
 * True when the lip geometry closes: the truncated arc (with its top roll,
 * if any) must still reach the top face without folding back.
 */
export function lipProfileValid(
  height: number,
  edgeSlope: number,
  lipRadius: number,
  lipTopRadius: number,
): boolean {
  if (lipRadius <= height) {
    return true;
  }
  if (lipTopRadius >= lipRadius) {
    return false;
  }
  const hypotenuse = Math.hypot(height, edgeSlope);
  const centerZ = (-lipRadius * edgeSlope) / hypotenuse;
  const sinStart = edgeSlope / hypotenuse;
  if (lipTopRadius > 0) {
    const sinTangent = (height - lipTopRadius - centerZ) / (lipRadius - lipTopRadius);
    return sinTangent >= sinStart && sinTangent <= 1;
  }
  return height - centerZ <= lipRadius;
}

function arcInsetAt(arc: ArcSegment, z: number): number {
  const dz = z - arc.centerZ;
  return arc.centerInset - Math.sqrt(Math.max(0, arc.radius * arc.radius - dz * dz));
}

/** Total inset of the top face relative to the bottom rim. */
export function topInsetFor(
  height: number,
  edgeSlope: number,
  lipRadius: number,
  lipTopRadius = 0,
): number {
  if (lipRadius <= 0) {
    return edgeSlope;
  }
  const shape = lipShape(height, edgeSlope, lipRadius, lipTopRadius);
  if (shape.roll !== null) {
    return shape.roll.centerInset;
  }
  if (lipRadius > height) {
    return arcInsetAt(shape.main, height);
  }
  return shape.main.centerInset;
}

/** Inset of the wall at height `z`, exact on all profile segments. */
export function profileInsetAt(profile: EdgeProfile, z: number): number {
  const { height, edgeSlope, lipRadius, lipTopRadius } = profile;
  if (lipRadius <= 0) {
    return (edgeSlope * z) / height;
  }
  const shape = lipShape(height, edgeSlope, lipRadius, lipTopRadius);
  if (z <= shape.tangentZ) {
    return (edgeSlope * z) / height;
  }
  if (shape.roll !== null) {
    const rollStartZ = shape.roll.centerZ + shape.roll.radius * Math.sin(shape.roll.startAngle);
    if (z > rollStartZ) {
      return arcInsetAt(shape.roll, z);
    }
  }
  return arcInsetAt(shape.main, z);
}

function sampleArc(
  arc: ArcSegment,
  arcTol: number,
  height: number,
  samples: EdgeProfileSample[],
): void {
  const cosHalf = Math.max(-1, 1 - arcTol / arc.radius);
  const maxStep = Math.max(2 * Math.acos(cosHalf), 1e-6);
  const steps = Math.max(3, Math.ceil((arc.endAngle - arc.startAngle) / maxStep));
  for (let i = 0; i <= steps; i++) {
    const angle = arc.startAngle + ((arc.endAngle - arc.startAngle) * i) / steps;
    samples.push({
      inset: arc.centerInset - arc.radius * Math.cos(angle),
      z: Math.min(height, Math.max(0, arc.centerZ + arc.radius * Math.sin(angle))),
    });
  }
}

/**
 * Samples the profile for ring-stack construction. Returns ascending-z
 * samples from the bottom rim to the top face; the arcs are sampled so
 * their chord error stays well within `tolMm`. The profile is convex, so
 * a convex hull over rings at these samples reproduces it within
 * tolerance.
 */
export function computeEdgeProfile(
  height: number,
  edgeSlope: number,
  lipRadius: number,
  tolMm: number,
  lipTopRadius = 0,
): EdgeProfile {
  const topInset = topInsetFor(height, edgeSlope, lipRadius, lipTopRadius);
  if (lipRadius <= 0) {
    return {
      height,
      edgeSlope,
      lipRadius,
      lipTopRadius,
      topInset,
      samples: [
        { inset: 0, z: 0 },
        { inset: edgeSlope, z: height },
      ],
    };
  }
  const shape = lipShape(height, edgeSlope, lipRadius, lipTopRadius);
  const arcTol = tolMm / ARC_TOL_RATIO;
  const samples: EdgeProfileSample[] = shape.tangentZ > 0 ? [{ inset: 0, z: 0 }] : [];
  sampleArc(shape.main, arcTol, height, samples);
  if (shape.roll !== null) {
    sampleArc(shape.roll, arcTol, height, samples);
  }
  return { height, edgeSlope, lipRadius, lipTopRadius, topInset, samples };
}
