import { defaultAdapterTrayParams, defaultMovementTrayParams } from '../params/trays.ts';
import type { BaseParams, ShapeSpec } from '../params/types.ts';
import { defaultParams } from '../params/types.ts';
import type { Job } from './job.ts';

export type GameSystem =
  | 'Warhammer 40k'
  | 'Age of Sigmar'
  | 'The Old World'
  | 'Warhammer Fantasy (legacy)'
  | 'Warmachine & Hordes';

export interface LibraryEntry {
  system: GameSystem;
  name: string;
  job: Job;
}

function roundBase(diameter: number, overrides: Partial<BaseParams> = {}): Job {
  return {
    generator: 'base',
    params: {
      ...defaultParams(),
      shape: { kind: 'round', diameter },
      height: 3.4,
      edgeSlope: 1.3,
      hollow: diameter >= 40 ? { wall: 1.1, topThickness: 1, supports: null } : null,
      ...overrides,
    },
  };
}

function ovalBase(preset: ShapeSpec & { kind: 'gwOval' }): Job {
  return {
    generator: 'base',
    params: {
      ...defaultParams(),
      shape: preset,
      height: 3.4,
      edgeSlope: 1.3,
      hollow: { wall: 1.1, topThickness: 1, supports: null },
    },
  };
}

// All basic bases use the height, slope, and wall measured from an
// original WHFB/TOW infantry base; GW publishes no official drawings.
function squareBase(size: number): Job {
  return {
    generator: 'base',
    params: {
      ...defaultParams(),
      shape: { kind: 'square', size },
      height: 3.4,
      edgeSlope: 1.3,
      hollow: { wall: 1.1, topThickness: 1, supports: null },
    },
  };
}

function rectBase(length: number, width: number): Job {
  return {
    generator: 'base',
    params: {
      ...defaultParams(),
      shape: { kind: 'rect', length, width },
      height: 3.4,
      edgeSlope: 1.3,
      hollow: { wall: 1.1, topThickness: 1, supports: null },
    },
  };
}

function plainOvalBase(length: number, width: number): Job {
  return {
    generator: 'base',
    params: {
      ...defaultParams(),
      shape: { kind: 'oval', length, width },
      height: 3.4,
      edgeSlope: 1.3,
      hollow: { wall: 1.1, topThickness: 1, supports: null },
    },
  };
}

// Warmachine MK IV plays on exactly five round sizes: 30, 40, 50, 80,
// and 120 mm; the 80 mm extra large is new in MK IV, the others go back
// to MK I. Privateer Press publishes no profile drawings; production
// bases show a side wall that is one continuous quarter circle from the
// bottom rim to the recessed top plate, so the lip radius equals the
// full height.
function lippedRoundBase(diameter: number): Job {
  return {
    generator: 'base',
    params: {
      ...defaultParams(),
      shape: { kind: 'round', diameter },
      height: 4.8,
      edgeSlope: 0,
      lipRadius: 4.8,
      recess: { depth: 0.5, inset: 1.2 },
      hollow: diameter >= 40 ? { wall: 1.1, topThickness: 1.2, supports: null } : null,
    },
  };
}

function adapterTray(donor: ShapeSpec, target: ShapeSpec, cols: number, rows: number): Job {
  return {
    generator: 'adapterTray',
    params: { ...defaultAdapterTrayParams(), donor, target, cols, rows },
  };
}

function movementTray(pocketShape: ShapeSpec, cols: number, rows: number): Job {
  return {
    generator: 'movementTray',
    params: { ...defaultMovementTrayParams(), pocketShape, cols, rows },
  };
}

// The official lance wedge: rank r holds r + 1 knights, so ranks of
// 2/3/4/5 give the 3/6/10/15 cavalry sizes sold as lance trays.
function lanceTray(pocketShape: ShapeSpec, ranks: number): Job {
  return {
    generator: 'movementTray',
    params: {
      ...defaultMovementTrayParams(),
      pocketShape,
      pocketRotated: true,
      formation: 'lance',
      cols: 1,
      rows: ranks,
    },
  };
}

function skirmishTray(pocketShape: ShapeSpec, cols: number, rows: number, gap: number): Job {
  return {
    generator: 'movementTray',
    params: {
      ...defaultMovementTrayParams(),
      pocketShape,
      formation: 'skirmish',
      cols,
      rows,
      gap,
    },
  };
}

export const GAME_LIBRARY: LibraryEntry[] = [
  { system: 'Warhammer 40k', name: 'Infantry 25 mm', job: roundBase(25) },
  { system: 'Warhammer 40k', name: 'Infantry 28.5 mm', job: roundBase(28.5) },
  { system: 'Warhammer 40k', name: 'Primaris 32 mm', job: roundBase(32) },
  { system: 'Warhammer 40k', name: 'Terminator / Gravis 40 mm', job: roundBase(40) },
  { system: 'Warhammer 40k', name: 'Bike / Heavy 50 mm', job: roundBase(50) },
  { system: 'Warhammer 40k', name: 'Large creature 60 mm', job: roundBase(60) },
  { system: 'Warhammer 40k', name: 'Monster / walker 80 mm', job: roundBase(80) },
  { system: 'Warhammer 40k', name: 'Brutalis / Ballistus dreadnought 90 mm', job: roundBase(90) },
  { system: 'Warhammer 40k', name: 'War Dog 100 mm', job: roundBase(100) },
  { system: 'Warhammer 40k', name: 'Great Unclean One 130 mm', job: roundBase(130) },
  { system: 'Warhammer 40k', name: 'Soul Grinder 160 mm', job: roundBase(160) },
  {
    system: 'Warhammer 40k',
    name: 'Dreadnought 90x52 oval',
    job: ovalBase({ kind: 'gwOval', preset: '90x52' }),
  },
  {
    system: 'Warhammer 40k',
    name: 'Vehicle 105x70 oval',
    job: ovalBase({ kind: 'gwOval', preset: '105x70' }),
  },
  {
    system: 'Warhammer 40k',
    name: 'Flyer 120x92 oval',
    job: ovalBase({ kind: 'gwOval', preset: '120x92' }),
  },
  { system: 'Warhammer 40k', name: 'Medium vehicle 150x95 oval', job: plainOvalBase(150, 95) },
  { system: 'Warhammer 40k', name: 'Knight 170x109 oval', job: plainOvalBase(170, 109) },
  { system: 'Age of Sigmar', name: 'Infantry 25 mm', job: roundBase(25) },
  { system: 'Age of Sigmar', name: 'Infantry 28.5 mm', job: roundBase(28.5) },
  { system: 'Age of Sigmar', name: 'Infantry 32 mm', job: roundBase(32) },
  { system: 'Age of Sigmar', name: 'Hero 40 mm', job: roundBase(40) },
  { system: 'Age of Sigmar', name: 'Large infantry 50 mm', job: roundBase(50) },
  { system: 'Age of Sigmar', name: 'Large creature 60 mm', job: roundBase(60) },
  { system: 'Age of Sigmar', name: 'Slann / Kroak 80 mm', job: roundBase(80) },
  { system: 'Age of Sigmar', name: 'Greater daemon 100 mm', job: roundBase(100) },
  {
    system: 'Age of Sigmar',
    name: 'Cavalry 60x35 oval',
    job: ovalBase({ kind: 'gwOval', preset: '60x35' }),
  },
  {
    system: 'Age of Sigmar',
    name: 'Large cavalry 75x42 oval',
    job: ovalBase({ kind: 'gwOval', preset: '75x42' }),
  },
  {
    system: 'Age of Sigmar',
    name: 'Large creature 90x52 oval',
    job: ovalBase({ kind: 'gwOval', preset: '90x52' }),
  },
  {
    system: 'Age of Sigmar',
    name: 'Monster 105x70 oval',
    job: ovalBase({ kind: 'gwOval', preset: '105x70' }),
  },
  {
    system: 'Age of Sigmar',
    name: 'Largest monster 170x105 oval',
    job: ovalBase({ kind: 'gwOval', preset: '170x105' }),
  },
  { system: 'Age of Sigmar', name: 'Monster 90 mm', job: roundBase(90) },
  {
    system: 'Age of Sigmar',
    name: 'Monster 120x92 oval',
    job: ovalBase({ kind: 'gwOval', preset: '120x92' }),
  },
  { system: 'Age of Sigmar', name: 'Mega 130 mm', job: roundBase(130) },
  { system: 'Age of Sigmar', name: 'Colossal 160 mm', job: roundBase(160) },
  {
    system: 'Age of Sigmar',
    name: 'Movement tray 5x2 of 25 mm rounds',
    job: movementTray({ kind: 'round', diameter: 25 }, 5, 2),
  },
  {
    system: 'Age of Sigmar',
    name: 'Movement tray 5x2 of 28.5 mm rounds',
    job: movementTray({ kind: 'round', diameter: 28.5 }, 5, 2),
  },
  {
    system: 'Age of Sigmar',
    name: 'Movement tray 5x2 of 32 mm rounds',
    job: movementTray({ kind: 'round', diameter: 32 }, 5, 2),
  },
  {
    system: 'Age of Sigmar',
    name: 'Movement tray 3x2 of 40 mm rounds',
    job: movementTray({ kind: 'round', diameter: 40 }, 3, 2),
  },
  {
    system: 'Age of Sigmar',
    name: 'Movement tray 3x1 of 60x35 ovals',
    job: movementTray({ kind: 'gwOval', preset: '60x35' }, 3, 1),
  },
  {
    system: 'Age of Sigmar',
    name: 'Loose skirmish tray 5x2 of 32 mm rounds',
    job: skirmishTray({ kind: 'round', diameter: 32 }, 5, 2, 2),
  },
  {
    system: 'Warhammer 40k',
    name: 'Movement tray 5x2 of 32 mm rounds',
    job: movementTray({ kind: 'round', diameter: 32 }, 5, 2),
  },
  {
    system: 'Warhammer 40k',
    name: 'Loose skirmish tray 5x2 of 25 mm rounds',
    job: skirmishTray({ kind: 'round', diameter: 25 }, 5, 2, 2),
  },
  { system: 'The Old World', name: 'Infantry 25 mm square', job: squareBase(25) },
  { system: 'The Old World', name: 'Heavy infantry 30 mm square', job: squareBase(30) },
  { system: 'The Old World', name: 'Ogre 40 mm square', job: squareBase(40) },
  { system: 'The Old World', name: 'Large monster 50 mm square', job: squareBase(50) },
  { system: 'The Old World', name: 'Cavalry 30x60 mm', job: rectBase(60, 30) },
  { system: 'The Old World', name: 'Chariot 60x100 mm', job: rectBase(100, 60) },
  { system: 'The Old World', name: 'Monster 100x150 mm', job: rectBase(150, 100) },
  {
    system: 'The Old World',
    name: 'WHFB 20 mm to TOW 25 mm adapter (single)',
    job: adapterTray({ kind: 'square', size: 20 }, { kind: 'square', size: 25 }, 1, 1),
  },
  {
    system: 'The Old World',
    name: 'WHFB 20 mm to TOW 25 mm adapter rank (5x1)',
    job: adapterTray({ kind: 'square', size: 20 }, { kind: 'square', size: 25 }, 5, 1),
  },
  {
    system: 'The Old World',
    name: 'WHFB cavalry 25x50 to TOW 30x60 adapter',
    job: adapterTray(
      { kind: 'rect', length: 50, width: 25 },
      { kind: 'rect', length: 60, width: 30 },
      1,
      1,
    ),
  },
  {
    system: 'The Old World',
    name: 'Movement tray 5x1 of 25 mm squares',
    job: movementTray({ kind: 'square', size: 25 }, 5, 1),
  },
  {
    system: 'The Old World',
    name: 'Movement tray 5x2 of 25 mm squares',
    job: movementTray({ kind: 'square', size: 25 }, 5, 2),
  },
  {
    system: 'The Old World',
    name: 'Horde tray 5x4 of 25 mm squares',
    job: movementTray({ kind: 'square', size: 25 }, 5, 4),
  },
  {
    system: 'The Old World',
    name: 'Movement tray 5x2 of 30 mm squares',
    job: movementTray({ kind: 'square', size: 30 }, 5, 2),
  },
  {
    system: 'The Old World',
    name: 'Ogre tray 3x2 of 40 mm squares',
    job: movementTray({ kind: 'square', size: 40 }, 3, 2),
  },
  {
    system: 'The Old World',
    name: 'Cavalry rank 5x1 of 30x60 mm',
    job: movementTray({ kind: 'rect', length: 60, width: 30 }, 5, 1),
  },
  {
    system: 'The Old World',
    name: 'Cavalry block 5x2 of 30x60 mm',
    job: movementTray({ kind: 'rect', length: 60, width: 30 }, 5, 2),
  },
  {
    system: 'The Old World',
    name: 'Bretonnian lance of 3 (2 ranks) 30x60 mm',
    job: lanceTray({ kind: 'rect', length: 60, width: 30 }, 2),
  },
  {
    system: 'The Old World',
    name: 'Bretonnian lance of 6 (3 ranks) 30x60 mm',
    job: lanceTray({ kind: 'rect', length: 60, width: 30 }, 3),
  },
  {
    system: 'The Old World',
    name: 'Bretonnian lance of 10 (4 ranks) 30x60 mm',
    job: lanceTray({ kind: 'rect', length: 60, width: 30 }, 4),
  },
  {
    system: 'The Old World',
    name: 'Bretonnian lance of 15 (5 ranks) 30x60 mm',
    job: lanceTray({ kind: 'rect', length: 60, width: 30 }, 5),
  },
  { system: 'Warhammer Fantasy (legacy)', name: 'Infantry 20 mm square', job: squareBase(20) },
  {
    system: 'Warhammer Fantasy (legacy)',
    name: 'Heavy infantry 25 mm square',
    job: squareBase(25),
  },
  { system: 'Warhammer Fantasy (legacy)', name: 'Ogre 40 mm square', job: squareBase(40) },
  { system: 'Warhammer Fantasy (legacy)', name: 'Monster 50 mm square', job: squareBase(50) },
  { system: 'Warhammer Fantasy (legacy)', name: 'Cavalry 25x50 mm', job: rectBase(50, 25) },
  { system: 'Warhammer Fantasy (legacy)', name: 'Chariot 50x100 mm', job: rectBase(100, 50) },
  {
    system: 'Warhammer Fantasy (legacy)',
    name: 'Movement tray 5x2 of 20 mm squares',
    job: movementTray({ kind: 'square', size: 20 }, 5, 2),
  },
  {
    system: 'Warhammer Fantasy (legacy)',
    name: 'Horde tray 5x4 of 20 mm squares',
    job: movementTray({ kind: 'square', size: 20 }, 5, 4),
  },
  {
    system: 'Warhammer Fantasy (legacy)',
    name: 'Movement tray 5x2 of 25 mm squares',
    job: movementTray({ kind: 'square', size: 25 }, 5, 2),
  },
  {
    system: 'Warhammer Fantasy (legacy)',
    name: 'Cavalry rank 5x1 of 25x50 mm',
    job: movementTray({ kind: 'rect', length: 50, width: 25 }, 5, 1),
  },
  {
    system: 'Warhammer Fantasy (legacy)',
    name: 'Bretonnian lance of 6 (3 ranks) 25x50 mm',
    job: lanceTray({ kind: 'rect', length: 50, width: 25 }, 3),
  },
  {
    system: 'Warhammer Fantasy (legacy)',
    name: 'Bretonnian lance of 10 (4 ranks) 25x50 mm',
    job: lanceTray({ kind: 'rect', length: 50, width: 25 }, 4),
  },
  { system: 'Warmachine & Hordes', name: 'Small 30 mm', job: lippedRoundBase(30) },
  { system: 'Warmachine & Hordes', name: 'Medium 40 mm', job: lippedRoundBase(40) },
  { system: 'Warmachine & Hordes', name: 'Large 50 mm', job: lippedRoundBase(50) },
  { system: 'Warmachine & Hordes', name: 'Extra large 80 mm (MK IV)', job: lippedRoundBase(80) },
  { system: 'Warmachine & Hordes', name: 'Huge 120 mm', job: lippedRoundBase(120) },
];

export const GAME_SYSTEMS: GameSystem[] = [
  'Warhammer 40k',
  'Age of Sigmar',
  'The Old World',
  'Warhammer Fantasy (legacy)',
  'Warmachine & Hordes',
];

export function libraryFor(system: GameSystem): LibraryEntry[] {
  return GAME_LIBRARY.filter((entry) => entry.system === system);
}
