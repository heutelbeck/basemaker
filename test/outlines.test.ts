import { describe, expect, it } from 'vitest';
import { getManifold } from '../src/geometry/manifoldContext.ts';
import { insetOutline, signedArea } from '../src/geometry/outlines.ts';
import { circleOutline, rectOutline } from '../src/params/tessellation.ts';

describe('insetOutline', () => {
  it('insets a rectangle into a smaller exact rectangle', async () => {
    const wasm = await getManifold();
    const inset = insetOutline(wasm, rectOutline(10, 10), 2);
    expect(Math.abs(signedArea(inset))).toBeCloseTo(16 * 16, 6);
  });

  it('insets a circle outline by a true parallel distance', async () => {
    const wasm = await getManifold();
    const r = 16;
    const delta = 1.5;
    const outline = circleOutline(r, 0.02);
    const n = outline.length;
    const expectedVertexRadius = r - delta / Math.cos(Math.PI / n);
    const inset = insetOutline(wasm, outline, delta);
    for (const [x, y] of inset) {
      expect(Math.hypot(x, y)).toBeCloseTo(expectedVertexRadius, 3);
    }
  });

  it('returns the outline unchanged for a zero inset', async () => {
    const wasm = await getManifold();
    const outline = rectOutline(5, 5);
    expect(insetOutline(wasm, outline, 0)).toBe(outline);
  });

  it('reports a vanishing outline instead of silently returning nothing', async () => {
    const wasm = await getManifold();
    const outline = rectOutline(1, 1);
    expect(() => insetOutline(wasm, outline, 2)).toThrowError(/vanished/);
  });
});
