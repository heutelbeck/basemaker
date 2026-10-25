import { describe, expect, it } from 'vitest';
import type { BaseParams } from '../src/params/types.ts';
import { defaultParams } from '../src/params/types.ts';
import { magnetPositions } from '../src/params/magnetLayout.ts';
import { validate } from '../src/params/validate.ts';

function params(overrides: Partial<BaseParams>): BaseParams {
  return { ...defaultParams(), ...overrides };
}

describe('validate', () => {
  it('accepts the default 32 mm round base', () => {
    expect(validate(defaultParams())).toEqual([]);
  });

  it('accepts a fully featured feasible base', () => {
    const featured = params({
      shape: { kind: 'round', diameter: 40 },
      height: 5,
      edgeSlope: 1.5,
      hollow: { wall: 2, topThickness: 1.5, supports: null },
      magnets: {
        shape: 'round',
        layout: 'line',
        diameter: 5,
        length: 5,
        width: 5,
        depth: 2,
        count: 2,
        spacing: 12,
        offsetX: 0,
        offsetY: 0,
        padding: 0.6,
      },
      recess: { depth: 1, inset: 2 },
    });
    expect(validate(featured)).toEqual([]);
  });

  const rejectionCases: [string, Partial<BaseParams>, string][] = [
    ['zero diameter', { shape: { kind: 'round', diameter: 0 } }, 'shape-dimensions'],
    ['negative height', { height: -1 }, 'height'],
    ['negative edge slope', { edgeSlope: -0.5 }, 'edge-slope-negative'],
    ['edge slope consuming the footprint', { edgeSlope: 16 }, 'edge-slope-large'],
    [
      'oval narrower than long axis flipped',
      { shape: { kind: 'oval', length: 30, width: 60 } },
      'shape-proportions',
    ],
    [
      'hollow wall meeting in the middle',
      { hollow: { wall: 15, topThickness: 1, supports: null } },
      'hollow-wall',
    ],
    [
      'hollow top thicker than the base',
      { hollow: { wall: 1, topThickness: 5, supports: null } },
      'hollow-top',
    ],
    [
      'magnet deeper than the base',
      {
        magnets: {
          shape: 'round',
          layout: 'line',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 4,
          count: 1,
          spacing: 0,
          offsetX: 0,
          offsetY: 0,
          padding: 0.5,
        },
      },
      'magnet-depth',
    ],
    [
      'glue height pushing the magnet slot through the base',
      {
        magnets: {
          shape: 'round',
          layout: 'line',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 2.5,
          count: 1,
          spacing: 0,
          offsetX: 0,
          offsetY: 0,
          padding: 0.5,
        },
        magnetGlueHeightMm: 0.5,
      },
      'magnet-depth',
    ],
    [
      'negative glue height',
      {
        magnets: {
          shape: 'round',
          layout: 'line',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 2.5,
          count: 1,
          spacing: 0,
          offsetX: 0,
          offsetY: 0,
          padding: 0.5,
        },
        magnetGlueHeightMm: -0.1,
      },
      'magnet-glue-height',
    ],
    [
      'magnets overlapping each other',
      {
        magnets: {
          shape: 'round',
          layout: 'line',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 2,
          count: 2,
          spacing: 4,
          offsetX: 0,
          offsetY: 0,
          padding: 0,
        },
      },
      'magnet-spacing',
    ],
    [
      'magnet pushed outside the footprint',
      {
        magnets: {
          shape: 'round',
          layout: 'line',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 2,
          count: 1,
          spacing: 0,
          offsetX: 14,
          offsetY: 0,
          padding: 0,
        },
      },
      'magnet-fit',
    ],
    ['recess deeper than the base', { recess: { depth: 4, inset: 1 } }, 'recess-depth'],
    ['recess inset consuming the footprint', { recess: { depth: 1, inset: 16 } }, 'recess-inset'],
    [
      'slotta slot wider than the footprint',
      { slotta: { length: 40, width: 8, angleDeg: 0, offsetX: 0, offsetY: 0 } },
      'slotta-fit',
    ],
    [
      'slotta slot cutting into a magnet holder',
      {
        slotta: { length: 20, width: 3, angleDeg: 0, offsetX: 0, offsetY: 0 },
        magnets: {
          shape: 'round',
          layout: 'line',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 2,
          count: 1,
          spacing: 0,
          offsetX: 0,
          offsetY: 0,
          padding: 0.5,
        },
      },
      'slotta-magnet-overlap',
    ],
    [
      'converter insert larger than the outer base',
      {
        shape: {
          kind: 'converter',
          outer: { kind: 'round', diameter: 32 },
          insert: { kind: 'square', size: 30 },
          insertDepth: 3,
          clearance: 0.15,
        },
        height: 5,
      },
      'converter-fit',
    ],
    ['chord tolerance out of range', { quality: { chordTolMm: 5 } }, 'quality'],
  ];

  it.each(rejectionCases)('rejects %s', (_label, overrides, expectedCode) => {
    const issues = validate(params(overrides));
    expect(issues.map((issue) => issue.code)).toContain(expectedCode);
  });

  it('accepts the default 26x2 mm slotta slot at 45 degrees on a 32 mm base', () => {
    const slotted = params({
      slotta: { length: 26, width: 2, angleDeg: 45, offsetX: 0, offsetY: 0 },
    });
    expect(validate(slotted)).toEqual([]);
  });

  it('accepts the GW-style slot with one edge on the center diagonal', () => {
    const gwStyle = params({
      slotta: { length: 26, width: 2, angleDeg: 45, offsetX: 0.71, offsetY: -0.71 },
    });
    expect(validate(gwStyle)).toEqual([]);
  });

  it('rejects the same slot once an offset pushes a corner past the rim', () => {
    const offset = params({
      slotta: { length: 26, width: 2, angleDeg: 45, offsetX: 2, offsetY: 0 },
    });
    expect(validate(offset).map((issue) => issue.code)).toContain('slotta-fit');
  });

  it('accepts a converter whose insert fits with clearance and rim', () => {
    const converter = params({
      shape: {
        kind: 'converter',
        outer: { kind: 'round', diameter: 50 },
        insert: { kind: 'square', size: 25 },
        insertDepth: 3,
        clearance: 0.15,
      },
      height: 5,
    });
    expect(validate(converter)).toEqual([]);
  });
});

describe('magnetPositions', () => {
  it('centers a single magnet on the offset', () => {
    expect(magnetPositions(1, 10, 2)).toEqual([2]);
  });

  it('spreads multiple magnets symmetrically around the offset', () => {
    expect(magnetPositions(3, 10, 0)).toEqual([-10, 0, 10]);
  });
});

describe('magnet layouts', () => {
  it('spreads grid and equal-area layouts inside the footprint', async () => {
    const { magnetCenters } = await import('../src/params/magnetLayout.ts');
    const { pointInShape, resolveShape } = await import('../src/params/shapeMetrics.ts');
    const base = params({
      shape: { kind: 'round', diameter: 60 },
      magnets: {
        shape: 'round',
        layout: 'grid',
        diameter: 5,
        length: 5,
        width: 2,
        depth: 2,
        count: 5,
        spacing: 8,
        offsetX: 0,
        offsetY: 0,
        padding: 1.5,
      },
    });
    const resolved = resolveShape({ kind: 'round', diameter: 60 });
    for (const layout of ['grid', 'even'] as const) {
      const layouted = {
        ...base,
        magnets: { ...(base.magnets ?? ({} as never)), layout },
      };
      const centers = magnetCenters(layouted);
      expect(centers).toHaveLength(5);
      for (const [x, y] of centers) {
        expect(pointInShape(resolved, x, y, 4)).toBe(true);
      }
      const unique = new Set(centers.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`));
      expect(unique.size).toBe(5);
      expect(magnetCenters(layouted)).toEqual(centers);
    }
  });
});

describe('magnet holders beside a diagonal slotta slot', () => {
  const holder = (count: number): BaseParams['magnets'] => ({
    shape: 'round',
    layout: 'even',
    diameter: 6.1,
    length: 5,
    width: 5,
    depth: 2,
    count,
    spacing: 12,
    offsetX: 0,
    offsetY: 0,
    padding: 0.8,
  });
  const slotted = (shape: BaseParams['shape'], slotLength: number, count: number) =>
    params({
      shape,
      height: 3.4,
      edgeSlope: 1.3,
      hollow: { wall: 1.1, topThickness: 1, supports: null },
      slotta: { length: slotLength, width: 2, angleDeg: 45, offsetX: 0.71, offsetY: -0.71 },
      magnets: holder(count),
    });

  it.each([
    ['25 mm TOW square', { kind: 'square', size: 25 }, 26, 1],
    ['50 mm square with two magnets', { kind: 'square', size: 50 }, 26, 2],
    ['32 mm round', { kind: 'round', diameter: 32 }, 26, 1],
    ['25 mm round', { kind: 'round', diameter: 25 }, 21, 1],
    ['40 mm round with two magnets', { kind: 'round', diameter: 40 }, 26, 2],
    ['30x60 mm cavalry rect', { kind: 'rect', length: 60, width: 30 }, 26, 1],
    ['60x35 mm oval', { kind: 'oval', length: 60, width: 35 }, 26, 1],
    ['40 mm hex', { kind: 'hex', size: 40 }, 26, 1],
  ] as [string, BaseParams['shape'], number, number][])(
    'moves the holders of a %s into the free area beside the slot',
    (_name, shape, slotLength, count) => {
      expect(validate(slotted(shape, slotLength, count))).toEqual([]);
    },
  );

  it('centers a single holder in the open half of a 25 mm square', async () => {
    const { magnetCenters } = await import('../src/params/magnetLayout.ts');
    const [[x, y]] = magnetCenters(slotted({ kind: 'square', size: 25 }, 26, 1));
    expect(x).toBeCloseTo(-y, 2);
    expect(x).toBeLessThan(-4);
  });

  it('reports holders that cannot fit beside the slot instead of hiding the conflict', () => {
    const crowded = slotted({ kind: 'round', diameter: 25 }, 21, 2);
    expect(validate(crowded).map((issue) => issue.code)).toContain('slotta-magnet-overlap');
  });

  it('keeps the holder clear of a mounting hole as well as the slot', () => {
    const withHole: BaseParams = {
      ...slotted({ kind: 'round', diameter: 40 }, 26, 1),
      slotta: { length: 26, width: 2, angleDeg: 0, offsetX: 0, offsetY: -6 },
      mountingHoles: {
        holes: [
          { shape: 'round' as const, sizeMm: 5, rimMm: 1, rotationDeg: 0, offsetX: 0, offsetY: 6 },
        ],
      },
    };
    expect(validate(withHole)).toEqual([]);
  });
});
