import type { Font } from 'opentype.js';
import { pointInPolygon } from '../../params/polygon.ts';
import type { LetteringParams } from '../../params/types.ts';
import type { Point2 } from '../../params/tessellation.ts';

/** Cap height of the DejaVu bold faces as a fraction of the em size. */
const CAP_HEIGHT_RATIO = 0.72;
const CURVE_STEPS = 8;


export interface GlyphContour {
  points: Point2[];
  isHole: boolean;
}

/**
 * One glyph placed on the arc: contours are in the glyph's local frame
 * (x centered on the glyph, baseline at y = 0, y up) and `angle` is the
 * polar angle of the glyph center on the layout circle.
 */
export interface GlyphLayout {
  angle: number;
  contours: GlyphContour[];
}

/**
 * A contour is a hole when it is nested inside an odd number of sibling
 * contours. Winding conventions differ between TrueType and CFF outlines,
 * so containment parity is the only reliable classification.
 */
function markHoles(contours: Point2[][]): { points: Point2[]; isHole: boolean }[] {
  return contours.map((contour) => {
    const [probeX, probeY] = contour[0];
    let depth = 0;
    for (const other of contours) {
      if (other !== contour && pointInPolygon(other, probeX, probeY)) {
        depth++;
      }
    }
    return { points: contour, isHole: depth % 2 === 1 };
  });
}

function flattenGlyph(font: Font, char: string, fontSize: number): Point2[][] {
  const glyph = font.charToGlyph(char);
  const path = glyph.getPath(0, 0, fontSize);
  const contours: Point2[][] = [];
  let current: Point2[] = [];
  let cursor: Point2 = [0, 0];
  const push = (x: number, y: number) => {
    current.push([x, -y]);
    cursor = [x, y];
  };
  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      if (current.length > 2) {
        contours.push(current);
      }
      current = [];
      push(cmd.x, cmd.y);
    } else if (cmd.type === 'L') {
      push(cmd.x, cmd.y);
    } else if (cmd.type === 'Q') {
      const [x0, y0] = cursor;
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const t = s / CURVE_STEPS;
        const mt = 1 - t;
        push(
          mt * mt * x0 + 2 * mt * t * cmd.x1 + t * t * cmd.x,
          mt * mt * y0 + 2 * mt * t * cmd.y1 + t * t * cmd.y,
        );
      }
    } else if (cmd.type === 'C') {
      const [x0, y0] = cursor;
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const t = s / CURVE_STEPS;
        const mt = 1 - t;
        push(
          mt * mt * mt * x0 +
            3 * mt * mt * t * cmd.x1 +
            3 * mt * t * t * cmd.x2 +
            t * t * t * cmd.x,
          mt * mt * mt * y0 +
            3 * mt * mt * t * cmd.y1 +
            3 * mt * t * t * cmd.y2 +
            t * t * t * cmd.y,
        );
      }
    } else {
      if (current.length > 2) {
        contours.push(current);
      }
      current = [];
    }
  }
  if (current.length > 2) {
    contours.push(current);
  }
  return contours;
}

/**
 * Lays the text out along an arc of the given radius: each glyph gets a
 * center angle so that glyph advances correspond to arc length, centered
 * on the lettering's position angle. Reading direction is increasing
 * angle, which reads left to right at the front of the base.
 */
export function layoutGlyphsOnArc(
  font: Font,
  lettering: LetteringParams,
  radius: number,
): GlyphLayout[] {
  const fontSize = lettering.sizeMm / CAP_HEIGHT_RATIO;
  const scale = fontSize / font.unitsPerEm;
  const glyphs = [...lettering.text].map((char) => font.charToGlyph(char));
  const advances = glyphs.map((glyph) => (glyph.advanceWidth ?? 0) * scale);
  const totalWidth = advances.reduce((acc, advance) => acc + advance, 0);
  const span = totalWidth / radius;
  const centerAngle = (lettering.angleDeg * Math.PI) / 180;
  let cursorAngle = centerAngle - span / 2;

  const layouts: GlyphLayout[] = [];
  for (let i = 0; i < lettering.text.length; i++) {
    const advance = advances[i];
    const glyphAngle = cursorAngle + advance / (2 * radius);
    cursorAngle += advance / radius;
    const contours = markHoles(flattenGlyph(font, lettering.text[i], fontSize)).map((contour) => ({
      points: contour.points.map(([gx, gy]) => [gx - advance / 2, gy] as Point2),
      isHole: contour.isHole,
    }));
    layouts.push({ angle: glyphAngle, contours });
  }
  return layouts;
}

/**
 * World-placed 2D contours for lettering on the top face: glyph tops point
 * toward the base center, so text at the default front position reads
 * upright from above.
 */
/**
 * Arc-placed contours grouped per glyph. Consumers must merge glyphs with
 * a boolean union: flattening all glyphs into one even-odd polygon set
 * inverts the fill wherever two glyphs overlap.
 */
export function textArcContourGroups(
  font: Font,
  lettering: LetteringParams,
  baselineRadius: number,
): GlyphContour[][] {
  const groups: GlyphContour[][] = [];
  for (const layout of layoutGlyphsOnArc(font, lettering, baselineRadius)) {
    const cos = Math.cos(layout.angle);
    const sin = Math.sin(layout.angle);
    const tangent: Point2 = [-sin, cos];
    const up: Point2 = [-cos, -sin];
    const origin: Point2 = [baselineRadius * cos, baselineRadius * sin];
    groups.push(
      layout.contours.map((contour) => ({
        isHole: contour.isHole,
        points: contour.points.map(([lx, ly]): Point2 => [
          origin[0] + lx * tangent[0] + ly * up[0],
          origin[1] + lx * tangent[1] + ly * up[1],
        ]),
      })),
    );
  }
  return groups;
}

export function textArcContours(
  font: Font,
  lettering: LetteringParams,
  baselineRadius: number,
): GlyphContour[] {
  return textArcContourGroups(font, lettering, baselineRadius).flat();
}

/**
 * Vertical center of the actual laid-out glyph outlines. Fonts overshoot
 * their nominal cap height differently, so centering on measured extents
 * is the only way side lettering lands exactly mid-wall for every font.
 */
export function glyphVerticalCenter(layouts: GlyphLayout[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const layout of layouts) {
    for (const contour of layout.contours) {
      for (const [, y] of contour.points) {
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
    }
  }
  return min === Infinity ? 0 : (min + max) / 2;
}
