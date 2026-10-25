import { unzipSync } from 'fflate';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { baseplateDownload } from '../src/export/baseplateZip.ts';
import { buildBaseplatePiece, buildBaseplatePieces } from '../src/geometry/buildBaseplate.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { BaseplateParams } from '../src/params/baseplate.ts';
import {
  BASEPLATE_PROFILE_HEIGHT_MM,
  BASEPLATE_STAR_MM,
  connectorHoleZ,
  defaultBaseplateParams,
  planBaseplate,
  validateBaseplate,
} from '../src/params/baseplate.ts';
import { GRID_PITCH_MM } from '../src/params/paintRack.ts';

function baseplate(overrides: Partial<BaseplateParams> = {}): BaseplateParams {
  return { ...defaultBaseplateParams(), ...overrides };
}

/** Whether `solid` has material in a 0.2 mm cube around the point. */
function materialAt(wasm: ManifoldToplevel, solid: Manifold, x: number, y: number, z: number) {
  const probe = wasm.Manifold.cube([0.2, 0.2, 0.2], true).translate(x, y, z);
  const hit = solid.intersect(probe);
  try {
    return hit.volume() > 1e-6;
  } finally {
    probe.delete();
    hit.delete();
  }
}

/** The drawer's parts in place, released after `check`. */
async function withParts<T>(
  params: BaseplateParams,
  check: (wasm: ManifoldToplevel, parts: ReturnType<typeof buildBaseplatePieces>) => T,
): Promise<T> {
  const wasm = await getManifold();
  const parts = buildBaseplatePieces(wasm, params);
  try {
    return check(wasm, parts);
  } finally {
    for (const { solid } of parts) {
      solid.delete();
    }
  }
}

describe('baseplate drawer planning', () => {
  it('fills a 12 x 6 drawer with whole units and splits it into six 4 x 3 parts for a 240 mm plate', () => {
    const pieces = planBaseplate(baseplate()) ?? [];
    expect(pieces.map((piece) => `${piece.label} ${piece.unitsX}x${piece.unitsY}`)).toEqual([
      'A1 4x3',
      'A2 4x3',
      'B1 4x3',
      'B2 4x3',
      'C1 4x3',
      'C2 4x3',
    ]);
    for (const piece of pieces) {
      expect(piece.width).toBeLessThanOrEqual(240);
      expect(piece.depth).toBeLessThanOrEqual(240);
    }
  });

  it('covers the drawer wall to wall, less the play, with parts that meet without gaps', () => {
    const params = baseplate({ drawerWidthMm: 530, drawerDepthMm: 270, clearanceMm: 1 });
    const pieces = planBaseplate(params) ?? [];
    const left = Math.min(...pieces.map((piece) => piece.centerX - piece.width / 2));
    const right = Math.max(...pieces.map((piece) => piece.centerX + piece.width / 2));
    const back = Math.min(...pieces.map((piece) => piece.centerY - piece.depth / 2));
    const front = Math.max(...pieces.map((piece) => piece.centerY + piece.depth / 2));
    expect(right - left).toBeCloseTo(529, 6);
    expect(front - back).toBeCloseTo(269, 6);
    const area = pieces.reduce((sum, piece) => sum + piece.width * piece.depth, 0);
    expect(area).toBeCloseTo(529 * 269, 3);
  });

  it('puts the filler on the chosen side of the grid', () => {
    const rest = 530 - 1 - 12 * GRID_PITCH_MM;
    const centered = planBaseplate(baseplate({ drawerWidthMm: 530 })) ?? [];
    const leftWall = planBaseplate(baseplate({ drawerWidthMm: 530, alignX: 'start' })) ?? [];
    const sum = (pieces: typeof centered) => [
      Math.max(...pieces.map((piece) => piece.padLeft)),
      Math.max(...pieces.map((piece) => piece.padRight)),
    ];
    expect(sum(centered)[0]).toBeCloseTo(rest / 2, 6);
    expect(sum(centered)[1]).toBeCloseTo(rest / 2, 6);
    expect(sum(leftWall)[0]).toBe(0);
    expect(sum(leftWall)[1]).toBeCloseTo(rest, 6);
  });

  it('lays the drawer out as on the build plate: front wall at -Y, part A1 front left', () => {
    const pieces = planBaseplate(baseplate({ alignY: 'start' })) ?? [];
    const a1 = pieces.find((piece) => piece.label === 'A1');
    const frontEdge = Math.min(...pieces.map((piece) => piece.centerY - piece.depth / 2));
    const leftEdge = Math.min(...pieces.map((piece) => piece.centerX - piece.width / 2));
    expect(a1?.centerY).toBe(Math.min(...pieces.map((piece) => piece.centerY)));
    expect(a1?.centerX).toBe(Math.min(...pieces.map((piece) => piece.centerX)));
    // Against the front wall: no filler at -Y, all of it at the back.
    expect(pieces.every((piece) => piece.padFront === 0)).toBe(true);
    expect(Math.max(...pieces.map((piece) => piece.padBack))).toBeGreaterThan(0);
    expect(frontEdge).toBeCloseTo(-(6 * GRID_PITCH_MM + 8 - 1) / 2, 6);
    expect(leftEdge).toBeLessThan(0);
  });

  it('leaves a rest too narrow to print open instead of adding a sliver of filler', () => {
    const pieces = planBaseplate(baseplate({ drawerWidthMm: 4 * GRID_PITCH_MM + 1.6 })) ?? [];
    expect(pieces.every((piece) => piece.padLeft === 0 && piece.padRight === 0)).toBe(true);
  });

  it('rejects drawers smaller than one unit and plates that cannot take a part', () => {
    expect(validateBaseplate(baseplate({ drawerWidthMm: 40 }))).toEqual([
      expect.objectContaining({ code: 'baseplate-size' }),
    ]);
    expect(validateBaseplate(baseplate({ plateWidthMm: 44 }))).toEqual([
      expect.objectContaining({ code: 'baseplate-plate' }),
    ]);
    expect(validateBaseplate(baseplate({ connectorHoleMm: 3.5 }))).toEqual([
      expect.objectContaining({ code: 'baseplate-values' }),
    ]);
    expect(validateBaseplate(baseplate())).toEqual([]);
  });
});

describe('baseplate geometry', () => {
  it('stands the receiving profile at the crossings and only low bars between them', async () => {
    const params = baseplate({
      drawerWidthMm: 2 * GRID_PITCH_MM + 1,
      drawerDepthMm: 2 * GRID_PITCH_MM + 1,
    });
    await withParts(params, (wasm, [{ solid }]) => {
      // The middle crossing of a 2 x 2 grid sits on the origin; probe its arm past the star hole.
      expect(materialAt(wasm, solid, 6, 0, BASEPLATE_PROFILE_HEIGHT_MM - 1)).toBe(true);
      // Halfway along a grid line, between two crossings, only the flat bar remains.
      expect(materialAt(wasm, solid, 0, 21, params.barHeightMm / 2)).toBe(true);
      expect(materialAt(wasm, solid, 0, 21, params.barHeightMm + 0.5)).toBe(false);
      // The cell centers stay open down to the drawer floor.
      expect(materialAt(wasm, solid, 21, 21, 0.2)).toBe(false);
      expect(solid.boundingBox().max[2]).toBeCloseTo(BASEPLATE_PROFILE_HEIGHT_MM, 6);
    });
  });

  it('uses a fraction of the material of a full profile baseplate', async () => {
    const wasm = await getManifold();
    const light = baseplate();
    const full = baseplate({ nodeArmMm: GRID_PITCH_MM / 2 });
    const [piece] = planBaseplate(light) ?? [];
    const lightSolid = buildBaseplatePiece(wasm, light, piece);
    const fullSolid = buildBaseplatePiece(wasm, full, piece);
    try {
      expect(lightSolid.volume()).toBeLessThan(0.6 * fullSolid.volume());
    } finally {
      lightSolid.delete();
      fullSolid.delete();
    }
  });

  it('lines up a connector hole through the half nodes on both sides of every seam', async () => {
    const params = baseplate();
    await withParts(params, (wasm, parts) => {
      const [a1, b1] = [parts[0], parts[2]];
      const seamX = a1.piece.centerX + a1.piece.width / 2;
      const y = a1.piece.centerY + a1.piece.depth / 2 - a1.piece.padBack - GRID_PITCH_MM;
      const z = connectorHoleZ(params);
      for (const offset of [-7, -5, 5, 7]) {
        const part = offset < 0 ? a1.solid : b1.solid;
        // The hole runs through the profile wall, with material on either side of it.
        expect(materialAt(wasm, part, seamX + offset, y, z)).toBe(false);
        expect(
          materialAt(wasm, part, seamX + offset, y + params.connectorHoleMm / 2 + 0.6, z),
        ).toBe(true);
      }
    });
  });

  it('leaves the seams closed when connector holes are off', async () => {
    const params = baseplate({ connectorHoles: false });
    await withParts(params, (wasm, parts) => {
      const a1 = parts[0];
      const seamX = a1.piece.centerX + a1.piece.width / 2;
      const y = a1.piece.centerY + a1.piece.depth / 2 - a1.piece.padBack - GRID_PITCH_MM;
      expect(materialAt(wasm, a1.solid, seamX - 6, y, connectorHoleZ(params))).toBe(true);
    });
  });

  it('carries the bars on across a skeleton filler to the drawer wall', async () => {
    const params = baseplate({
      drawerWidthMm: 2 * GRID_PITCH_MM + 11,
      drawerDepthMm: GRID_PITCH_MM + 1,
      solidFiller: false,
    });
    await withParts(params, (wasm, [{ piece, solid }]) => {
      expect(piece.padLeft).toBeCloseTo(5, 6);
      const wall = piece.centerX - piece.width / 2;
      // Along the wall and along the grid lines out to it.
      expect(materialAt(wasm, solid, wall + 0.3, 10, 0.5)).toBe(true);
      expect(materialAt(wasm, solid, wall + 2.5, piece.centerY - piece.depth / 2 + 0.3, 0.5)).toBe(
        true,
      );
      // The filler between the bars stays open.
      expect(materialAt(wasm, solid, wall + 2.5, 10, 0.5)).toBe(false);
    });
  });
});

describe('baseplate downloads', () => {
  it('zips one print per distinct part, counting parts that match after a half turn as one', async () => {
    const wasm = await getManifold();
    const download = baseplateDownload(wasm, baseplate(), 'drawer');
    expect(download.extension).toBe('zip');
    expect(Object.keys(unzipSync(download.data)).sort()).toEqual([
      'drawer-part-A1-4x3-print-2.stl',
      'drawer-part-A2-4x3-print-2.stl',
      'drawer-part-B1-4x3-print-2.stl',
    ]);
  });

  it('downloads a plain STL when the drawer is one part', async () => {
    const wasm = await getManifold();
    const download = baseplateDownload(
      wasm,
      baseplate({ drawerWidthMm: 3 * GRID_PITCH_MM + 5, drawerDepthMm: 2 * GRID_PITCH_MM + 5 }),
      'drawer',
    );
    expect(download.extension).toBe('stl');
  });
});

describe('baseplate solid filler', () => {
  it('fills the strip between the grid and the drawer wall by default', async () => {
    const params = baseplate({
      drawerWidthMm: 2 * GRID_PITCH_MM + 11,
      drawerDepthMm: GRID_PITCH_MM + 1,
    });
    await withParts(params, (wasm, [{ piece, solid }]) => {
      const wall = piece.centerX - piece.width / 2;
      expect(materialAt(wasm, solid, wall + 2.5, 10, params.barHeightMm / 2)).toBe(true);
      expect(materialAt(wasm, solid, wall + 2.5, 10, params.barHeightMm + 0.3)).toBe(false);
    });
  });
});

describe('baseplate for an IKEA Alex wide drawer', () => {
  const alex = baseplate({ drawerWidthMm: 600, drawerDepthMm: 423 });

  it('mirrors the part sizes across the drawer so facing parts print the same', () => {
    const pieces = planBaseplate(alex) ?? [];
    expect(pieces.map((piece) => `${piece.label} ${piece.unitsX}x${piece.unitsY}`)).toEqual([
      'A1 5x5',
      'A2 5x5',
      'B1 4x5',
      'B2 4x5',
      'C1 5x5',
      'C2 5x5',
    ]);
  });

  it('downloads three prints of two parts each for the 14 x 10 grid', async () => {
    const wasm = await getManifold();
    const download = baseplateDownload(wasm, alex, 'alex');
    expect(Object.keys(unzipSync(download.data)).sort()).toEqual([
      'alex-part-A1-5x5-print-2.stl',
      'alex-part-A2-5x5-print-2.stl',
      'alex-part-B1-4x5-print-2.stl',
    ]);
  });
});

describe('baseplate crossings', () => {
  const twoByTwo = baseplate({
    drawerWidthMm: 2 * GRID_PITCH_MM + 1,
    drawerDepthMm: 2 * GRID_PITCH_MM + 1,
  });

  it('opens a star hole through the middle of a crossing and keeps the cell corner walls round it', async () => {
    await withParts(twoByTwo, (wasm, [{ solid }]) => {
      for (const z of [0.5, 2, 4]) {
        expect(materialAt(wasm, solid, 0, 0, z)).toBe(false);
      }
      // Beside each cell corner, inside its arc, the profile wall stays.
      expect(materialAt(wasm, solid, 3, 0.5, 2)).toBe(true);
    });
  });

  it('keeps the crossing closed when star holes are off', async () => {
    await withParts({ ...twoByTwo, starHoles: false }, (wasm, [{ solid }]) => {
      expect(materialAt(wasm, solid, 0, 0, 2)).toBe(true);
    });
  });

  it('slopes the arm ends down at 45 degrees instead of ending them square', async () => {
    const arm = twoByTwo.nodeArmMm;
    await withParts(twoByTwo, (wasm, [{ solid }]) => {
      // Two millimetres past the arm the profile still stands near the floor but not up top.
      expect(materialAt(wasm, solid, arm + 2, 0, 1.6)).toBe(true);
      expect(materialAt(wasm, solid, arm + 2, 0, 3.5)).toBe(false);
    });
  });
});

describe('baseplate rounded drawer corners', () => {
  it('rounds the outer corners and runs a bar round the arc', async () => {
    const params = baseplate({
      drawerWidthMm: 2 * GRID_PITCH_MM + 11,
      drawerDepthMm: 2 * GRID_PITCH_MM + 11,
      cornerRadiusMm: 8,
    });
    await withParts(params, (wasm, [{ piece, solid }]) => {
      const left = piece.centerX - piece.width / 2;
      const front = piece.centerY - piece.depth / 2;
      // The square corner is gone, the arc carries a bar.
      expect(materialAt(wasm, solid, left + 0.5, front + 0.5, 0.5)).toBe(false);
      const along = 8 - 8 / Math.SQRT2 + 0.5;
      expect(materialAt(wasm, solid, left + along, front + along, 0.5)).toBe(true);
    });
  });
});

describe('baseplate edges next to filler and connectors for later', () => {
  // One part, 5.5 mm filler left and right, against the front wall, 2 mm filler at the back.
  const edgeDrawer = (overrides: Partial<BaseplateParams> = {}) =>
    baseplate({ drawerWidthMm: 96, drawerDepthMm: 87, alignY: 'start', ...overrides });

  it('leaves no star notch at a crossing on a grid edge that borders filler', async () => {
    await withParts(edgeDrawer(), (wasm, [{ piece, solid }]) => {
      const gridRight = piece.centerX + piece.width / 2 - piece.padRight;
      const gridBack = piece.centerY + piece.depth / 2 - piece.padBack;
      expect(materialAt(wasm, solid, gridRight - 0.5, gridBack - 0.5, 0.5)).toBe(true);
      // Against the bare front wall the half star stays open.
      const gridFront = piece.centerY - piece.depth / 2;
      expect(materialAt(wasm, solid, piece.centerX + 0.5, gridFront + 0.5, 0.5)).toBe(false);
    });
  });

  it('fills a rounded corner up to the cell opening instead of leaving it open', async () => {
    await withParts(edgeDrawer({ solidFiller: false }), (wasm, [{ piece, solid }]) => {
      const right = piece.centerX + piece.width / 2;
      const back = piece.centerY + piece.depth / 2;
      expect(materialAt(wasm, solid, right - 3, back - 3, 0.5)).toBe(true);
    });
  });

  it('drills connector holes into the outer edges only when asked', async () => {
    const probe = async (connectorHolesOnEdges: boolean) => {
      const params = edgeDrawer({ connectorHolesOnEdges });
      return withParts(params, (wasm, [{ piece, solid }]) => {
        const gridFront = piece.centerY - piece.depth / 2;
        return materialAt(wasm, solid, piece.centerX, gridFront + 5, connectorHoleZ(params));
      });
    };
    expect(await probe(false)).toBe(true);
    expect(await probe(true)).toBe(false);
  });
});

describe('baseplate defaults', () => {
  it('rounds the drawer corners like the star arcs and fills the edges solid', () => {
    const params = defaultBaseplateParams();
    expect(params.cornerRadiusMm).toBe(BASEPLATE_STAR_MM);
    expect(params.solidFiller).toBe(true);
    expect(params.connectorHolesOnEdges).toBe(false);
  });
});
