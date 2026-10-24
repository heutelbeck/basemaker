import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { paintRackDownload } from '../src/export/paintRackZip.ts';
import { buildJobBundle } from '../src/generators/job.ts';
import { buildPaintRack, buildPaintRacks } from '../src/geometry/buildPaintRack.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { PaintRackParams, Vec3 } from '../src/params/paintRack.ts';
import {
  FOOT_CORE_HALF_MM,
  FOOT_HEIGHT_MM,
  BIN_GAP_MM,
  axisDirection,
  GRID_PITCH_MM,
  VALLEJO_BOTTLE,
  binSize,
  defaultPaintRackParams,
  footRadiusAt,
  END_STOP_MM,
  planRacks,
  pocketRadiusAt,
  rackHoldsBottle,
  solvePaintRack,
  validatePaintRack,
} from '../src/params/paintRack.ts';

const DRAWER_HEIGHT_MM = 67;

/** A single 5x4 rack unless the overrides say otherwise. */
/** The fast-print setup: staggered rib racks spread across the drawer. */
function classic(overrides: Partial<PaintRackParams> = {}): PaintRackParams {
  return {
    ...defaultPaintRackParams(),
    clearanceMm: 0.7,
    maxHeightMm: 67,
    arrangement: 'staggered',
    fill: 'ribs',
    tileModules: false,
    bottleGapMm: 0.8,
    ...overrides,
  };
}

function rack(overrides: Partial<PaintRackParams> = {}): PaintRackParams {
  return classic({ unitsX: 5, unitsY: 4, ...overrides });
}

/** The real bottle (no clearance) at its pocket position, as one solid. */
function bottleSolid(
  wasm: ManifoldToplevel,
  params: PaintRackParams,
  anchor: Vec3,
  tiltDeg: number,
): Manifold {
  const { bottle } = params;
  const shrink = params.clearanceMm / 2;
  const body = wasm.Manifold.cylinder(
    bottle.bodyLengthMm,
    pocketRadiusAt(params, 0) - shrink,
    pocketRadiusAt(params, 0) - shrink,
    96,
  );
  const neck = wasm.Manifold.cylinder(
    bottle.lengthMm - bottle.bodyLengthMm,
    pocketRadiusAt(params, bottle.bodyLengthMm + 1e-6) - shrink,
    pocketRadiusAt(params, bottle.lengthMm) - shrink,
    96,
  ).translate(0, 0, bottle.bodyLengthMm);
  // A tilted bottle settles onto the pocket bottom, perpendicular to its
  // axis; 0.1 mm stays free for the chord tolerance of the pocket mesh.
  const tilt = (tiltDeg * Math.PI) / 180;
  const settle = tiltDeg >= 89.9 ? 0 : shrink - 0.1;
  return wasm.Manifold.union(body, neck)
    .rotate([tiltDeg - 90, 0, 0])
    .translate(anchor[0], anchor[1] + settle * Math.sin(tilt), anchor[2] - settle * Math.cos(tilt));
}

/**
 * The baseplate around the bin in bin coordinates: everything below the
 * ridge crest that is not one of the bin's foot cells.
 */
function baseplateKeepOut(wasm: ManifoldToplevel, params: PaintRackParams): Manifold {
  const { width, depth } = binSize(params);
  const slab = wasm.Manifold.cube([width + 20, depth + 20, 10], true).translate(
    0,
    0,
    FOOT_HEIGHT_MM - 5,
  );
  const cells: Manifold[] = [];
  for (let i = 0; i < params.unitsX; i++) {
    for (let j = 0; j < params.unitsY; j++) {
      const points: [number, number, number][] = [];
      for (const z of [0, 0.8, 2.6, FOOT_HEIGHT_MM]) {
        const radius = footRadiusAt(z);
        for (let k = 0; k < 64; k++) {
          const angle = (2 * Math.PI * k) / 64;
          const sx = Math.cos(angle) >= 0 ? 1 : -1;
          const sy = Math.sin(angle) >= 0 ? 1 : -1;
          points.push([
            (i - (params.unitsX - 1) / 2) * GRID_PITCH_MM +
              sx * FOOT_CORE_HALF_MM +
              radius * Math.cos(angle),
            (j - (params.unitsY - 1) / 2) * GRID_PITCH_MM +
              sy * FOOT_CORE_HALF_MM +
              radius * Math.sin(angle),
            z,
          ]);
        }
      }
      // The foot cavity of the baseplate reaches below the bin foot.
      cells.push(wasm.Manifold.hull(points));
      cells.push(wasm.Manifold.hull(points.filter(([, , z]) => z === 0)).translate(0, 0, 0));
    }
  }
  const below = wasm.Manifold.cube([width + 40, depth + 40, 20], true).translate(0, 0, -10);
  return slab.subtract(wasm.Manifold.union(cells)).subtract(below);
}

async function bottlesAndRack(params: PaintRackParams) {
  const wasm = await getManifold();
  const layout = solvePaintRack(params);
  expect(layout).not.toBeNull();
  const tilt = layout?.tiltDeg ?? 0;
  const bottles = wasm.Manifold.union(
    (layout?.bottles ?? []).map((anchor) => bottleSolid(wasm, params, anchor, tilt)),
  );
  return { wasm, layout, bottles, body: buildPaintRack(wasm, params) };
}

describe('paint rack for low drawers', () => {
  it('defaults to block racks for the 14x6 drawer: five per three units, no walls, 70 mm', () => {
    const params = defaultPaintRackParams();
    const layout = solvePaintRack(params);
    expect(layout?.bottles).toHaveLength(138);
    expect(layout?.totalHeight).toBeLessThanOrEqual(70);
    expect(planRacks(params).map((r) => [r.unitsX, r.unitsY])).toEqual([
      ...[3, 3, 3, 3, 2].map((width) => [width, 3]),
      ...[3, 3, 3, 3, 2].map((width) => [width, 3]),
    ]);
  });

  it('fills the 14x6 drawer with three racks that fit the Bambu Lab X2D plate', () => {
    const params = classic();
    const layout = solvePaintRack(params);
    const racks = planRacks(params);
    expect(racks.map((r) => [r.unitsX, r.unitsY])).toEqual([
      [5, 5],
      [5, 5],
      [4, 5],
    ]);
    for (const r of racks) {
      expect(r.unitsX * GRID_PITCH_MM - BIN_GAP_MM).toBeLessThanOrEqual(params.plateWidthMm);
      expect(r.unitsY * GRID_PITCH_MM - BIN_GAP_MM).toBeLessThanOrEqual(params.plateDepthMm);
    }
    expect(layout?.bottles.length).toBeGreaterThanOrEqual(110);
    expect(layout?.totalHeight).toBeLessThanOrEqual(DRAWER_HEIGHT_MM);
    expect(layout?.tiltDeg).toBeGreaterThan(33);
    for (const bottle of layout?.bottles ?? []) {
      expect(racks.filter((r) => rackHoldsBottle(r, bottle))).toHaveLength(1);
    }
  });

  it.each([
    ['tilted', {}],
    ['upright', { orientation: 'upright' as const }],
  ])(
    'leaves out exactly the drawer rows without support for %s bottles, and keeps them when asked',
    async (_name, overrides) => {
      const wasm = await getManifold();
      const params = classic(overrides);
      const full = { ...params, trimEmptyRows: false };
      const rowsOf = (racks: ReturnType<typeof planRacks>) =>
        new Set(racks.flatMap((r) => Array.from({ length: r.unitsY }, (_, i) => r.startY + i)));
      const trimmed = rowsOf(planRacks(params));
      expect(rowsOf(planRacks(full))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
      const solids = buildPaintRacks(wasm, full);
      const window = (row: number) =>
        wasm.Manifold.cube([params.unitsX * GRID_PITCH_MM, GRID_PITCH_MM - 1, 200], true).translate(
          0,
          (row + 0.5 - params.unitsY / 2) * GRID_PITCH_MM,
          100 + FOOT_HEIGHT_MM + 3,
        );
      for (let row = 0; row < params.unitsY; row++) {
        const above = solids.reduce(
          (sum, { solid }) => sum + solid.intersect(window(row)).volume(),
          0,
        );
        expect(trimmed.has(row)).toBe(above > 1);
      }
      for (const bottle of solvePaintRack(params)?.bottles ?? []) {
        expect(planRacks(params).some((r) => rackHoldsBottle(r, bottle))).toBe(true);
      }
    },
  );

  it.each([
    ['block', { fill: 'block' as const }],
    ['filled', { fill: 'filled' as const }],
  ])(
    'gives every %s rack across the wide drawer the same material per cell and top level',
    async (_name, overrides) => {
      const wasm = await getManifold();
      const racks = buildPaintRacks(wasm, classic(overrides));
      const perCell = racks.map(({ rack, solid }) => solid.volume() / (rack.unitsX * rack.unitsY));
      const tops = racks.map(({ solid }) => solid.boundingBox().max[2]);
      expect(Math.min(...perCell) / Math.max(...perCell)).toBeGreaterThan(0.95);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(0.1);
    },
  );

  it('adds a row when the drawer leaves room for the caps in front of the grid', () => {
    const tight = solvePaintRack(rack({ unitsY: 6 }));
    const roomy = solvePaintRack(rack({ unitsY: 6, frontRoomMm: 35 }));
    expect(roomy?.bottles.length).toBeGreaterThan(tight?.bottles.length ?? Infinity);
    expect(tight?.frontOverhang).toBe(0);
    expect(roomy?.frontOverhang).toBeLessThanOrEqual(35);
  });

  it.each([
    ['rib', {}],
    ['block', { fill: 'block' as const }],
  ])(
    'splits a %s drawer into racks that fit together and carry every bottle',
    async (_name, overrides) => {
      const params = rack({
        unitsX: 4,
        unitsY: 4,
        plateWidthMm: 100,
        plateDepthMm: 100,
        ...overrides,
      });
      const wasm = await getManifold();
      const layout = solvePaintRack(params);
      const tilt = layout?.tiltDeg ?? 0;
      const racks = buildPaintRacks(wasm, params);
      expect(racks).toHaveLength(4);
      for (let i = 0; i < racks.length; i++) {
        for (let j = i + 1; j < racks.length; j++) {
          expect(racks[i].solid.intersect(racks[j].solid).volume()).toBeLessThan(0.01);
        }
      }
      let crossing = 0;
      for (const anchor of layout?.bottles ?? []) {
        const bottle = bottleSolid(wasm, params, anchor, tilt);
        const resting = bottle.translate(0, 0, -0.6);
        let carriers = 0;
        for (const { solid } of racks) {
          expect(bottle.intersect(solid).volume()).toBeLessThan(0.01);
          if (resting.intersect(solid).volume() > 0.5) {
            carriers++;
          }
        }
        expect(carriers).toBeGreaterThanOrEqual(1);
        if (carriers > 1) {
          crossing++;
        }
      }
      // Bottles across rack seams rest on both racks.
      expect(crossing).toBeGreaterThan(0);
    },
  );

  it.each([
    ['rib', {}],
    ['cradle', { fill: 'cradles' as const }],
    ['filled', { fill: 'filled' as const }],
  ])('keeps %s supports below the mid height of the bottles', async (_name, overrides) => {
    const params = rack({ unitsX: 3, unitsY: 4, ...overrides });
    const wasm = await getManifold();
    const body = buildPaintRack(wasm, params);
    const layout = solvePaintRack(params);
    expect(body.boundingBox().max[2]).toBeLessThan(0.6 * (layout?.binTop ?? 0));
  });

  it('prints the braced ribs as one connected piece', async () => {
    const wasm = await getManifold();
    const parts = buildPaintRack(wasm, rack({ unitsX: 3, unitsY: 4 })).decompose();
    expect(parts).toHaveLength(1);
  });

  it.each([
    ['grid on Gridfinity', {}],
    ['staggered on Gridfinity', { arrangement: 'staggered' as const }],
    ['flat bottom', { gridfinity: false }],
    ['cradles', { fill: 'cradles' as const }],
    ['filled', { fill: 'filled' as const }],
  ])('keeps the %s rack below the drawer front', async (_name, overrides) => {
    const params = rack(overrides);
    const wasm = await getManifold();
    const bundle = await buildJobBundle(wasm, { generator: 'paintRack', params });
    const baseplateBelowBin = params.gridfinity ? params.baseplateHeightMm - 4.65 : 0;
    expect(bundle.stats.sizeZ + baseplateBelowBin).toBeLessThanOrEqual(DRAWER_HEIGHT_MM);
    expect(solvePaintRack(params)?.totalHeight).toBeLessThanOrEqual(DRAWER_HEIGHT_MM);
  });

  it.each([
    ['5x5 staggered default', {}],
    ['3x4 grid', { arrangement: 'grid' as const, unitsX: 3, unitsY: 4 }],
    ['3x4 staggered', { unitsX: 3, unitsY: 4 }],
    ['3x4 block', { unitsX: 3, unitsY: 4, fill: 'block' as const }],
  ])('keeps the %s bottles clear of the baseplate and the rack', async (_name, overrides) => {
    const params = rack(overrides);
    const { wasm, bottles, body } = await bottlesAndRack(params);
    expect(bottles.intersect(baseplateKeepOut(wasm, params)).volume()).toBeLessThan(0.01);
    expect(bottles.intersect(body).volume()).toBeLessThan(0.01);
  });

  it('sinks bottles below the ridge crest into the foot cells where no ridge runs under them', async () => {
    const { bottles } = await bottlesAndRack(rack({ arrangement: 'grid', unitsX: 3, unitsY: 4 }));
    expect(bottles.boundingBox().min[2]).toBeLessThan(FOOT_HEIGHT_MM);
  });

  it('supports every bottle from below', async () => {
    const params = rack();
    const { wasm, layout, body } = await bottlesAndRack(params);
    for (const anchor of layout?.bottles ?? []) {
      const bottle = bottleSolid(wasm, params, anchor, layout?.tiltDeg ?? 0);
      expect(bottle.translate(0, 0, -0.6).intersect(body).volume()).toBeGreaterThan(1);
    }
  });

  it('keeps the bottles apart from each other', async () => {
    const params = rack({ arrangement: 'staggered', unitsX: 4, unitsY: 5 });
    const wasm = await getManifold();
    const layout = solvePaintRack(params);
    const solids = (layout?.bottles ?? []).map((anchor) =>
      bottleSolid(wasm, params, anchor, layout?.tiltDeg ?? 0),
    );
    const separate = solids.reduce((sum, solid) => sum + solid.volume(), 0);
    expect(wasm.Manifold.union(solids).volume()).toBeCloseTo(separate, 0);
  });

  it('tilts steeper on a flat bottom than on a 6 mm baseplate', () => {
    const flat = solvePaintRack(rack({ gridfinity: false }));
    const gridfinity = solvePaintRack(rack());
    expect(flat?.tiltDeg ?? 0).toBeGreaterThan(gridfinity?.tiltDeg ?? 90);
  });

  it('uses far less material with ribs than with cradles, and the most when filled', async () => {
    const wasm = await getManifold();
    const params = rack({ unitsX: 3, unitsY: 2 });
    const ribs = buildPaintRack(wasm, params);
    const cradles = buildPaintRack(wasm, { ...params, fill: 'cradles' });
    const filled = buildPaintRack(wasm, { ...params, fill: 'filled' });
    expect(ribs.volume()).toBeLessThan(cradles.volume() / 3);
    expect(filled.volume()).toBeGreaterThan(cradles.volume());
  });

  it('keeps every row of a filled rack at the height of the cradles', async () => {
    const wasm = await getManifold();
    const filled = buildPaintRack(wasm, rack({ fill: 'filled' }));
    const cradles = buildPaintRack(wasm, rack({ fill: 'cradles' }));
    expect(filled.boundingBox().max[2]).toBeLessThanOrEqual(cradles.boundingBox().max[2] + 0.1);
  });

  it.each([
    ['rib', {}],
    ['cradle', { fill: 'cradles' as const }],
    ['filled', { fill: 'filled' as const }],
  ])(
    'backs the bottom of every bottle in a %s rack with a solid end stop',
    async (_name, overrides) => {
      const params = rack({ unitsX: 3, unitsY: 2, ...overrides });
      const { wasm, layout, body } = await bottlesAndRack(params);
      const tilt = ((layout?.tiltDeg ?? 0) * Math.PI) / 180;
      const radius = pocketRadiusAt(params, 0);
      const width = binSize(params).width;
      // Probe behind the lower half of each bottle bottom, along its axis.
      const behind = END_STOP_MM / 2;
      const below = radius / 2;
      for (const [x, y, z] of layout?.bottles ?? []) {
        if (Math.abs(x) > width / 2 - 2) {
          continue;
        }
        const py = y - behind * Math.cos(tilt) + below * Math.sin(tilt);
        const pz = z - behind * Math.sin(tilt) - below * Math.cos(tilt);
        for (const dx of [-below, 0, below]) {
          const probe = wasm.Manifold.cube([0.6, 0.6, 0.6], true).translate(x + dx, py, pz);
          expect(probe.intersect(body).volume()).toBeCloseTo(probe.volume(), 3);
        }
      }
    },
  );

  it('leaves no dust traps below the bottles when filled', async () => {
    const params = rack({ fill: 'filled', unitsX: 3, unitsY: 2 });
    const { wasm, layout, body } = await bottlesAndRack(params);
    const tilt = ((layout?.tiltDeg ?? 0) * Math.PI) / 180;
    const radius = pocketRadiusAt(params, 0);
    const { width, depth } = binSize(params);
    const halfDepth = depth / 2;
    let probes = 0;
    for (const [x, y, z] of layout?.bottles ?? []) {
      // The fill rises below the bottles up to the level of the supports.
      const level = z + params.supportLengthMm * Math.sin(tilt);
      for (const s of [5, 20, 40, 55]) {
        const py = y + s * Math.cos(tilt);
        const underside = Math.min(z + s * Math.sin(tilt) - radius / Math.cos(tilt), level);
        const bottom = FOOT_HEIGHT_MM + params.floorMm;
        // Seam bottles sit on the side edge, their axes outside this rack.
        if (
          Math.abs(x) > width / 2 - 2 ||
          Math.abs(py) > halfDepth - 2 ||
          underside - 0.4 <= bottom
        ) {
          continue;
        }
        const height = underside - 0.4 - bottom;
        const probe = wasm.Manifold.cube([0.4, 0.4, height], false).translate(
          x - 0.2,
          py - 0.2,
          bottom,
        );
        expect(probe.intersect(body).volume()).toBeCloseTo(probe.volume(), 2);
        probes++;
      }
    }
    expect(probes).toBeGreaterThan(10);
  });

  it('adds no overhangs beyond the Gridfinity foot profile', async () => {
    const wasm = await getManifold();
    const ribs = await buildJobBundle(wasm, { generator: 'paintRack', params: rack() });
    const cradles = await buildJobBundle(wasm, {
      generator: 'paintRack',
      params: rack({ fill: 'cradles' }),
    });
    const flat = await buildJobBundle(wasm, {
      generator: 'paintRack',
      params: rack({ gridfinity: false }),
    });
    expect(ribs.stats.overhangAreaMm2).toBeLessThanOrEqual(cradles.stats.overhangAreaMm2 + 1);
    expect(flat.stats.overhangAreaMm2).toBeLessThan(1);
  });
});

describe('paint rack modules in a row', () => {
  const tiled = (overrides: Partial<PaintRackParams> = {}) =>
    rack({
      unitsX: 3,
      unitsY: 2,
      fill: 'block',
      clearanceMm: 1.2,
      bottleGapMm: -0.3,
      maxHeightMm: 70,
      tileModules: true,
      plateWidthMm: 256,
      plateDepthMm: 256,
      ...overrides,
    });

  it('lays one bottle row per grid unit at the same spot in every unit', () => {
    const layout = solvePaintRack(tiled({ unitsY: 6 }));
    const rows = [...new Set(layout?.bottles.map(([, y]) => Math.round(y * 1000) / 1000))];
    expect(rows).toHaveLength(6);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i] - rows[i - 1]).toBeCloseTo(GRID_PITCH_MM, 6);
    }
  });

  it('fills the 14x6 drawer with 135 bottles at 70 mm, caps reaching freely past the grid', () => {
    const layout = solvePaintRack(tiled({ unitsX: 14, unitsY: 6 }));
    expect(layout?.bottles.length).toBe(135);
    expect(layout?.totalHeight).toBeLessThanOrEqual(70);
    expect(layout?.frontOverhang).toBeGreaterThan(GRID_PITCH_MM / 2);
  });

  it.each([
    ['an open gap, five per three units', -0.3, [6, 6, 2]],
    ['touching pockets, eight per five units', 0, [5, 5, 4]],
  ])(
    'builds full-plate racks as identical modules and splits seam bottles half and half (%s)',
    async (_name, bottleGapMm, widths) => {
      const wasm = await getManifold();
      const params = tiled({ unitsX: 14, unitsY: 6, bottleGapMm });
      const layout = solvePaintRack(params);
      const racks = planRacks(params);
      expect(racks.map((r) => r.unitsX)).toEqual(widths);
      const seams = racks.slice(1).map((r) => r.centerX - (r.unitsX * GRID_PITCH_MM) / 2);
      const radius = params.bottle.bodyDiameterMm / 2;
      for (const [x] of layout?.bottles ?? []) {
        const crossing = seams.filter((seam) => Math.abs(x - seam) < radius);
        for (const seam of crossing) {
          expect(x).toBeCloseTo(seam, 6);
        }
      }
      expect(seams.every((seam) => layout?.bottles.some(([x]) => Math.abs(x - seam) < 1e-6))).toBe(
        true,
      );
      const download = paintRackDownload(wasm, params, 'drawer');
      expect(download.extension).toBe('zip');
      const [full, rest] = racks;
      expect(Object.keys(unzipSync(download.data)).sort()).toEqual([
        `drawer-rack-A1-${full.unitsX}x6-print-2.stl`,
        `drawer-rack-A3-${racks[2].unitsX}x6-print-1.stl`,
      ]);
      expect(rest.unitsX).toBe(full.unitsX);
    },
  );

  it('repeats five bottles every three grid units at the same spots along the drawer', () => {
    const params = tiled({ unitsX: 14, unitsY: 6 });
    const layout = solvePaintRack(params);
    const left = (params.unitsX * GRID_PITCH_MM) / 2;
    const period = 3 * GRID_PITCH_MM;
    for (const [x] of layout?.bottles ?? []) {
      const phase = ((x + left) % period) / (period / 10);
      expect(Math.abs(phase - Math.round(phase))).toBeLessThan(1e-6);
    }
    const firstRow = (layout?.bottles ?? []).filter(([, y]) => y === layout?.bottles[0][1]);
    for (let start = 0; start + 3 <= 12; start += 3) {
      const inPeriod = firstRow.filter(([x]) => {
        const u = (x + left) / GRID_PITCH_MM;
        return u > start && u < start + 3;
      });
      expect(inPeriod).toHaveLength(5);
    }
  });

  it('lets you look through every row of overlapping bores from side to side', async () => {
    const wasm = await getManifold();
    const params = tiled({ unitsX: 6, unitsY: 2 });
    const layout = solvePaintRack(params);
    const body = buildPaintRack(wasm, params);
    const tilt = layout?.tiltDeg ?? 0;
    const [, ay, az] = axisDirection(tilt);
    const rows = [...new Set((layout?.bottles ?? []).map(([, y]) => y))];
    expect(rows).toHaveLength(2);
    for (const y of rows) {
      const z = (layout?.bottles[0][2] ?? 0) + 15 * az;
      const sightLine = wasm.Manifold.cube([400, 0.5, 0.5], true).translate(0, y + 15 * ay, z);
      expect(sightLine.intersect(body).volume()).toBeLessThan(0.01);
    }
  });

  it('packs unstaggered rows tightly: five per three units, one row per unit, no walls', () => {
    const params = tiled({ unitsX: 14, unitsY: 6, arrangement: 'grid', bottleGapMm: -0.7 });
    const layout = solvePaintRack(params);
    const rows = [...new Set((layout?.bottles ?? []).map(([, y]) => y))].sort((p, q) => p - q);
    expect(rows).toHaveLength(6);
    const sin = Math.sin(((layout?.tiltDeg ?? 0) * Math.PI) / 180);
    const pocket = params.bottle.bodyDiameterMm + params.clearanceMm;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i] - rows[i - 1]).toBeCloseTo(GRID_PITCH_MM, 6);
      expect((rows[i] - rows[i - 1]) * sin).toBeLessThan(pocket);
      expect((rows[i] - rows[i - 1]) * sin).toBeGreaterThan(params.bottle.bodyDiameterMm);
    }
    for (const y of rows) {
      expect((layout?.bottles ?? []).filter((bottle) => bottle[1] === y)).toHaveLength(23);
    }
    expect(layout?.totalHeight).toBeLessThanOrEqual(70);
  });

  it('leaves the openings at the drawer side out of a rest narrower than three units', () => {
    const params = tiled({ unitsX: 14, unitsY: 6 });
    const layout = solvePaintRack(params);
    const half = (params.unitsX * GRID_PITCH_MM) / 2;
    expect(layout?.cutOnly.some(([x]) => x < -half + 1e-6)).toBe(true);
    expect(layout?.cutOnly.some(([x]) => x > half - 1e-6)).toBe(false);
  });

  it('rounds the knife edges where neighboring bores overlap', async () => {
    const wasm = await getManifold();
    const params = tiled({ unitsX: 6, unitsY: 2, arrangement: 'grid', bottleGapMm: -0.7 });
    const layout = solvePaintRack(params);
    const body = buildPaintRack(wasm, params);
    const tilt = layout?.tiltDeg ?? 0;
    const [, ay, az] = axisDirection(tilt);
    const [x, y, z] = layout?.bottles[1] ?? [0, 0, 0];
    const pitch = (3 * GRID_PITCH_MM) / 5;
    const radius = (params.bottle.bodyDiameterMm + params.clearanceMm) / 2;
    const edge = Math.sqrt(radius ** 2 - (pitch / 2) ** 2);
    // Below the axis, between two bores of a row, 1 mm past where the edge was.
    const s = 15;
    const probe = (depth: number) =>
      wasm.Manifold.cube([0.3, 0.3, 0.3], true)
        .translate(x + pitch / 2, y + s * ay + depth * az, z + s * az - depth * ay)
        .intersect(body)
        .volume();
    expect(probe(edge + 1)).toBeLessThan(1e-4);
    expect(probe(edge + 6)).toBeGreaterThan(0.02);
  });

  it('opens a gap between the bottles of a row while the bottles keep the clearance apart', () => {
    const params = tiled({ unitsX: 6 });
    const layout = solvePaintRack(params);
    const pocket = params.bottle.bodyDiameterMm + params.clearanceMm;
    const row = (layout?.bottles ?? [])
      .filter(([, y]) => Math.abs(y - (layout?.bottles[0][1] ?? 0)) < 1e-6)
      .map(([x]) => x)
      .sort((p, q) => p - q);
    expect(row.length).toBeGreaterThan(2);
    for (let i = 1; i < row.length; i++) {
      expect(row[i] - row[i - 1]).toBeLessThan(pocket);
      expect(row[i] - row[i - 1]).toBeGreaterThanOrEqual(
        params.bottle.bodyDiameterMm + params.clearanceMm - 0.3 - 1e-6,
      );
    }
  });

  it.each([
    ['block', {}],
    ['ribs', { fill: 'ribs' as const }],
  ])(
    'lets the caps of a %s module reach over an identical module in front without touching it',
    async (_name, overrides) => {
      const wasm = await getManifold();
      const params = tiled(overrides);
      const layout = solvePaintRack(params);
      expect(layout).not.toBeNull();
      const tilt = layout?.tiltDeg ?? 0;
      const body = buildPaintRack(wasm, params);
      const inFront = body.translate(0, params.unitsY * GRID_PITCH_MM, 0);
      const bottles = wasm.Manifold.union(
        (layout?.bottles ?? []).map((anchor) => bottleSolid(wasm, params, anchor, tilt)),
      );
      expect(bottles.boundingBox().max[1]).toBeGreaterThan(inFront.boundingBox().min[1] + 10);
      expect(bottles.intersect(inFront).volume()).toBeLessThan(0.5);
      expect(bottles.intersect(body).volume()).toBeLessThan(0.5);
    },
  );
});

describe('paint rack block with bores', () => {
  const block = (overrides: Partial<PaintRackParams> = {}) =>
    rack({ unitsX: 3, unitsY: 2, fill: 'block', ...overrides });

  it('holds the bottles from above yet lets them slide out along their axis', async () => {
    const params = block();
    const { wasm, layout, body } = await bottlesAndRack(params);
    const tilt = layout?.tiltDeg ?? 0;
    const [ax, ay, az] = axisDirection(tilt);
    const width = binSize(params).width;
    for (const anchor of layout?.bottles ?? []) {
      if (Math.abs(anchor[0]) > width / 2 - 2) {
        continue;
      }
      const bottle = bottleSolid(wasm, params, anchor, tilt);
      expect(bottle.translate(0, 0, 3).intersect(body).volume()).toBeGreaterThan(1);
      for (const slide of [10, 40, 120]) {
        const moved = bottle.translate(ax * slide, ay * slide, az * slide);
        expect(moved.intersect(body).volume()).toBeLessThan(0.01);
      }
    }
  });

  it('confines the overhang of its round bores to the short roofs over the bottle bottoms', async () => {
    const wasm = await getManifold();
    const ribs = await buildJobBundle(wasm, { generator: 'paintRack', params: rack() });
    const params = rack({ fill: 'block' });
    const bored = await buildJobBundle(wasm, { generator: 'paintRack', params });
    const bottles = solvePaintRack(params)?.bottles.length ?? 0;
    const extra = bored.stats.overhangAreaMm2 - ribs.stats.overhangAreaMm2;
    expect(extra / bottles).toBeLessThan(200);
  });

  it('ends every row at the same level as the cradles', async () => {
    const wasm = await getManifold();
    const bored = buildPaintRack(wasm, rack({ fill: 'block' }));
    const cradles = buildPaintRack(wasm, rack({ fill: 'cradles' }));
    expect(bored.boundingBox().max[2]).toBeLessThanOrEqual(cradles.boundingBox().max[2] + 0.1);
  });

  it('packs five touching bottles across three grid units', () => {
    const params = block({ arrangement: 'grid', bottleGapMm: 0 });
    expect(solvePaintRack(params)?.bottles).toHaveLength(5);
  });
});

describe('paint rack downloads', () => {
  it('zips one centered STL per distinct rack, each fitting the build plate', async () => {
    const wasm = await getManifold();
    const params = rack({ unitsX: 4, unitsY: 2, plateWidthMm: 100 });
    const download = paintRackDownload(wasm, params, 'drawer');
    expect(download.extension).toBe('zip');
    const files = unzipSync(download.data);
    const names = Object.keys(files).sort();
    expect(names).toEqual(['drawer-rack-A1-2x2-print-1.stl', 'drawer-rack-A2-2x2-print-1.stl']);
    for (const name of names) {
      const view = new DataView(files[name].buffer, files[name].byteOffset);
      const triangles = view.getUint32(80, true);
      expect(triangles).toBeGreaterThan(100);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      for (let t = 0; t < triangles; t++) {
        for (let v = 0; v < 3; v++) {
          const offset = 84 + t * 50 + 12 + v * 12;
          const x = view.getFloat32(offset, true);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, view.getFloat32(offset + 8, true));
        }
      }
      expect(minX + maxX).toBeCloseTo(0, 1);
      expect(maxX - minX).toBeLessThanOrEqual(params.plateWidthMm);
      expect(minZ).toBeCloseTo(0, 3);
    }
  });
});

describe('paint rack single download', () => {
  it('downloads a plain STL when every rack of the drawer is the same', async () => {
    const wasm = await getManifold();
    const params = { ...defaultPaintRackParams(), unitsX: 6, unitsY: 3 };
    expect(planRacks(params)).toHaveLength(2);
    const download = paintRackDownload(wasm, params, 'drawer');
    expect(download.extension).toBe('stl');
    expect(new TextDecoder().decode(download.data.subarray(0, 5))).not.toBe('PK\u0003\u0004');
  });
});

describe('paint rack staggered download', () => {
  it('splits staggered drawers into racks that all start on the same kind of row', async () => {
    const wasm = await getManifold();
    const params = { ...defaultPaintRackParams(), arrangement: 'staggered' as const };
    expect(planRacks(params).every((r) => r.unitsY % 2 === 0 && r.startY % 2 === 0)).toBe(true);
    const download = paintRackDownload(wasm, params, 'drawer');
    expect(Object.keys(unzipSync(download.data)).sort()).toEqual([
      'drawer-rack-A1-3x2-print-12.stl',
      'drawer-rack-A5-2x2-print-3.stl',
    ]);
  });
});

describe('paint rack preview', () => {
  it('shows mock bottles in the preview but keeps them out of size and volume', async () => {
    const wasm = await getManifold();
    const params = rack();
    const bundle = await buildJobBundle(wasm, { generator: 'paintRack', params });
    const mocks = bundle.parts.filter((part) => part.previewOnly === true);
    expect(mocks.map((part) => part.name)).toEqual(['mock bottles', 'mock caps']);
    expect(bundle.parts.filter((part) => part.previewOnly !== true)).toHaveLength(1);
    const body = buildPaintRack(wasm, params);
    expect(bundle.stats.volumeMm3).toBeCloseTo(body.volume(), 0);
    expect(bundle.stats.sizeZ).toBeCloseTo(body.boundingBox().max[2], 1);
  });
});

describe('upright paint rack', () => {
  it('fits nine Vallejo bottles on 2x2 units', async () => {
    const params = rack({ orientation: 'upright', arrangement: 'grid', unitsX: 2, unitsY: 2 });
    expect(solvePaintRack(params)?.bottles).toHaveLength(9);
    const { wasm, bottles, body } = await bottlesAndRack(params);
    expect(bottles.intersect(baseplateKeepOut(wasm, params)).volume()).toBeLessThan(0.01);
    expect(bottles.intersect(body).volume()).toBeLessThan(0.01);
  });
});

describe('paint rack validation', () => {
  it('reports a maximum height no tilt can meet', () => {
    expect(validatePaintRack(rack({ maxHeightMm: 20 })).map((issue) => issue.code)).toEqual([
      'paint-rack-height',
    ]);
  });

  it('reports a footprint too narrow for a single bottle', () => {
    const wide = { ...VALLEJO_BOTTLE, bodyDiameterMm: 45 };
    const params = rack({ unitsX: 1, unitsY: 1, bottle: wide });
    expect(validatePaintRack(params).map((issue) => issue.code)).toEqual(['paint-rack-fit']);
  });

  it.each([
    ['zero grid units', { unitsX: 0 }],
    ['a wall thinner than one line', { wallMm: 0.2 }],
    ['a floor thinner than the foot chamfer', { floorMm: 0.5 }],
    ['a negative baseplate height', { baseplateHeightMm: -1 }],
  ])('rejects %s', (_name, overrides) => {
    expect(validatePaintRack(rack(overrides)).map((issue) => issue.code)).toEqual([
      'paint-rack-values',
    ]);
  });
});
