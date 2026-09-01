/**
 * Mounting holes: vertical through-holes in the top face of a base, each
 * surrounded by a structural tube that runs down to the bottom rim so a
 * hollow base keeps material around the hole, like the peg holes on the
 * push-fit bases of recent GW starter boxes. Round holes take a diameter;
 * hex holes are measured across flats and can be rotated for keyed pegs.
 */
export type MountingHoleShape = 'round' | 'hex';

export interface MountingHoleSpec {
  shape: MountingHoleShape;
  sizeMm: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
  rimMm: number;
}

export interface MountingHoleParams {
  holes: MountingHoleSpec[];
}

export const DEFAULT_MOUNTING_HOLE_RIM = 1.5;
export const DEFAULT_MOUNTING_HOLE_SIZE = 5;

export function defaultMountingHole(): MountingHoleSpec {
  return {
    shape: 'round',
    sizeMm: DEFAULT_MOUNTING_HOLE_SIZE,
    offsetX: 0,
    offsetY: 0,
    rotationDeg: 0,
    rimMm: DEFAULT_MOUNTING_HOLE_RIM,
  };
}

/**
 * The hex peg hole of the small push-fit infantry bases from the
 * Leviathan and Armageddon boxes. The hole sits off-center, roughly a
 * third of the radius toward the front, under the model's pegged foot.
 * GW publishes no drawings; size and offset are estimates to verify
 * against an original base.
 */
export function gwHexPegHole(): MountingHoleParams {
  return {
    holes: [{ ...defaultMountingHole(), shape: 'hex', offsetY: 4 }],
  };
}

/**
 * The twin round peg holes of the larger push-fit bases from the
 * Leviathan and Armageddon boxes, side by side on the X axis. GW
 * publishes no drawings; sizes and spacing are community estimates to
 * verify against an original base.
 */
export function gwTwinPegHoles(): MountingHoleParams {
  return {
    holes: [
      { ...defaultMountingHole(), offsetX: -8 },
      { ...defaultMountingHole(), offsetX: 8 },
    ],
  };
}

/** The circumradius of a hole's outline, before the rim is added. */
export function holeCircumradius(hole: MountingHoleSpec): number {
  return hole.shape === 'hex' ? hole.sizeMm / Math.sqrt(3) : hole.sizeMm / 2;
}
