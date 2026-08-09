import { describe, expect, it } from 'vitest';
import { buildAdapterTray, buildMovementTray, cellCenters } from '../src/geometry/buildTray.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import type { AdapterTrayParams, MovementTrayParams } from '../src/params/trays.ts';
import {
  defaultAdapterTrayParams,
  defaultMovementTrayParams,
  validateAdapterTray,
  validateMovementTray,
} from '../src/params/trays.ts';

function movementTray(overrides: Partial<MovementTrayParams>): MovementTrayParams {
  return { ...defaultMovementTrayParams(), ...overrides };
}

function adapterTray(overrides: Partial<AdapterTrayParams>): AdapterTrayParams {
  return { ...defaultAdapterTrayParams(), ...overrides };
}

describe('cellCenters', () => {
  it('centers the grid on the origin', () => {
    const centers = cellCenters({ rows: 2, cols: 3, pitchX: 10, pitchY: 20 });
    expect(centers).toHaveLength(6);
    const sumX = centers.reduce((acc, [x]) => acc + x, 0);
    const sumY = centers.reduce((acc, [, y]) => acc + y, 0);
    expect(sumX).toBeCloseTo(0, 9);
    expect(sumY).toBeCloseTo(0, 9);
    expect(Math.max(...centers.map(([x]) => x))).toBeCloseTo(10, 9);
    expect(Math.max(...centers.map(([, y]) => y))).toBeCloseTo(10, 9);
  });
});

describe('movement tray', () => {
  it('builds a valid tray with one pocket per base', async () => {
    const wasm = await getManifold();
    const params = movementTray({ rows: 2, cols: 5, edgeSlope: 0 });
    const tray = buildMovementTray(wasm, params);
    expect(tray.status()).toBe('NoError');
    const side = 25 + 2 * params.clearance;
    const outerW = 5 * side + 2 * params.rim;
    const outerH = 2 * side + 2 * params.rim;
    const height = params.floor + params.pocketDepth;
    const solidVolume = outerW * outerH * height;
    const pocketVolume = 10 * side * side * params.pocketDepth;
    expect(tray.volume()).toBeCloseTo(solidVolume - pocketVolume, 0);
    tray.delete();
  });

  it('cuts a sheet inlay recess into the underside', async () => {
    const wasm = await getManifold();
    const plain = buildMovementTray(wasm, movementTray({ edgeSlope: 0 }));
    const inlayParams = movementTray({
      edgeSlope: 0,
      sheetInlay: { depth: 0.6, inset: 2, placement: 'underside' },
    });
    const withInlay = buildMovementTray(wasm, inlayParams);
    const side = 25 + 2 * inlayParams.clearance;
    const outerW = 5 * side + 2 * inlayParams.rim;
    const outerH = side + 2 * inlayParams.rim;
    const expected = (outerW - 4) * (outerH - 4) * 0.6;
    expect(plain.volume() - withInlay.volume()).toBeCloseTo(expected, 0);
    plain.delete();
    withInlay.delete();
  });

  it('supports round pockets for round-base games', async () => {
    const wasm = await getManifold();
    const tray = buildMovementTray(
      wasm,
      movementTray({ pocketShape: { kind: 'round', diameter: 32 }, rows: 2, cols: 5, gap: 1 }),
    );
    expect(tray.status()).toBe('NoError');
    expect(tray.genus()).toBe(0);
    tray.delete();
  });

  it('rejects an inlay deeper than the floor', () => {
    const issues = validateMovementTray(
      movementTray({ sheetInlay: { depth: 1.5, inset: 2, placement: 'underside' }, floor: 1.2 }),
    );
    expect(issues.map((issue) => issue.code)).toContain('tray-inlay-depth');
  });
});

describe('formations', () => {
  it('staggers lance columns back from the center column', async () => {
    const { formationCenters } = await import('../src/geometry/buildTray.ts');
    const centers = formationCenters('lance', 3, 3, 25, 50);
    const centerColumnYs = centers.filter(([x]) => Math.abs(x) < 1e-9).map(([, y]) => y);
    const flankColumnYs = centers.filter(([x]) => Math.abs(x - 25) < 1e-9).map(([, y]) => y);
    expect(Math.min(...flankColumnYs) - Math.min(...centerColumnYs)).toBeCloseTo(25, 9);
  });

  it('offsets alternate skirmish rows by half a pitch', async () => {
    const { formationCenters } = await import('../src/geometry/buildTray.ts');
    const centers = formationCenters('skirmish', 2, 3, 34, 34);
    const row0 = centers.slice(0, 3).map(([x]) => x);
    const row1 = centers.slice(3).map(([x]) => x);
    expect(row1[0] - row0[0]).toBeCloseTo(17, 9);
  });

  it('builds a valid wedge tray for a Bretonnian lance', async () => {
    const wasm = await getManifold();
    const tray = buildMovementTray(
      wasm,
      movementTray({
        pocketShape: { kind: 'rect', length: 50, width: 25 },
        pocketRotated: true,
        formation: 'lance',
        rows: 3,
        cols: 3,
        rim: 3,
        edgeSlope: 0,
      }),
    );
    expect(tray.status()).toBe('NoError');
    expect(tray.volume()).toBeGreaterThan(0);
    const box = tray.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(3 * (25 + 0.4) + 6, 1);
    expect(box.max[1] - box.min[1]).toBeCloseTo(3 * (50 + 0.4) + (50 + 0.4) / 2 + 6, 1);
    tray.delete();
  });

  it('builds a valid loose formation tray for round bases', async () => {
    const wasm = await getManifold();
    const tray = buildMovementTray(
      wasm,
      movementTray({
        pocketShape: { kind: 'round', diameter: 32 },
        formation: 'skirmish',
        rows: 2,
        cols: 5,
        gap: 2,
        edgeSlope: 0,
      }),
    );
    expect(tray.status()).toBe('NoError');
    expect(tray.genus()).toBe(0);
    tray.delete();
  });

  it('rotated pockets swap the cell orientation', async () => {
    const wasm = await getManifold();
    const tray = buildMovementTray(
      wasm,
      movementTray({
        pocketShape: { kind: 'rect', length: 50, width: 25 },
        pocketRotated: true,
        rows: 1,
        cols: 3,
        rim: 3,
        edgeSlope: 0,
      }),
    );
    const box = tray.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(3 * (25 + 0.4) + 6, 1);
    expect(box.max[1] - box.min[1]).toBeCloseTo(50 + 0.4 + 6, 1);
    tray.delete();
  });
});

describe('adapter tray', () => {
  it('occupies exactly the target footprint', async () => {
    const wasm = await getManifold();
    const params = adapterTray({ rows: 1, cols: 5 });
    const tray = buildAdapterTray(wasm, params);
    expect(tray.status()).toBe('NoError');
    const box = tray.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(5 * 25, 6);
    expect(box.max[1] - box.min[1]).toBeCloseTo(25, 6);
    tray.delete();
  });

  it('sinks each donor base into its own pocket', async () => {
    const wasm = await getManifold();
    const params = adapterTray({ rows: 1, cols: 5 });
    const tray = buildAdapterTray(wasm, params);
    const height = params.floor + params.pocketDepth;
    const solidVolume = 125 * 25 * height;
    const side = 20 + 2 * params.clearance;
    const pocketVolume = 5 * side * side * params.pocketDepth;
    expect(tray.volume()).toBeCloseTo(solidVolume - pocketVolume, 0);
    tray.delete();
  });

  it('cuts score lines along internal target cell boundaries', async () => {
    const wasm = await getManifold();
    const plain = buildAdapterTray(wasm, adapterTray({ rows: 1, cols: 5 }));
    const marked = buildAdapterTray(wasm, adapterTray({ rows: 1, cols: 5, cellMarkers: true }));
    const grooves = 4 * 0.4 * 25 * 0.3;
    expect(plain.volume() - marked.volume()).toBeCloseTo(grooves, 0);
    plain.delete();
    marked.delete();
  });

  it('recesses each pocket floor when the inlay placement is pockets', async () => {
    const wasm = await getManifold();
    const plain = buildAdapterTray(wasm, adapterTray({ rows: 1, cols: 5 }));
    const params = adapterTray({
      rows: 1,
      cols: 5,
      sheetInlay: { depth: 0.6, inset: 0, placement: 'pockets' },
    });
    const withInlay = buildAdapterTray(wasm, params);
    const side = 20 + 2 * params.clearance;
    const expected = 5 * side * side * 0.6;
    expect(plain.volume() - withInlay.volume()).toBeCloseTo(expected, 0);
    plain.delete();
    withInlay.delete();
  });

  it('rejects a donor base larger than the target cell', () => {
    const issues = validateAdapterTray(
      adapterTray({ donor: { kind: 'square', size: 25 }, target: { kind: 'square', size: 25 } }),
    );
    expect(issues.map((issue) => issue.code)).toContain('tray-cell');
  });
});
