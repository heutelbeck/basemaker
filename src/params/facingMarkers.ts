/**
 * Facing markers: engraved direction marks on the side wall of a base,
 * used by games with firing or line-of-fire arcs (Infinity, Warmachine,
 * X-Wing). Each marker sits at an absolute angle in the footprint plane
 * (0 degrees points along +X, counterclockwise positive, matching the
 * plaque and lettering angle convention) and is cut into the wall as an
 * indentation, never raised, so the outer footprint stays exact for
 * edge-to-edge measuring.
 */
export type FacingMarkerStyle = 'line' | 'triangleUp' | 'triangleDown' | 'topNotch' | 'bottomNotch';

export interface FacingMarkerSpec {
  angleDeg: number;
  style: FacingMarkerStyle;
  widthMm: number;
  lineWidthMm: number;
}

export interface FacingMarkerParams {
  depth: number;
  markers: FacingMarkerSpec[];
}

export const FACING_MARKER_STYLE_LABELS: Record<FacingMarkerStyle, string> = {
  line: 'Line',
  triangleUp: 'Triangle up',
  triangleDown: 'Triangle down',
  topNotch: 'Top notch',
  bottomNotch: 'Bottom notch',
};

export const DEFAULT_FACING_MARKER_DEPTH = 0.4;
export const DEFAULT_FACING_MARKER_WIDTH = 2.5;
export const DEFAULT_FACING_MARKER_LINE_WIDTH = 0.8;

/** Height of a notch triangle relative to its width. */
const NOTCH_HEIGHT_RATIO = 0.8;
/** Overshoot past the top and bottom faces so cutters never leave coplanar faces. */
const PROFILE_OVERSHOOT = 0.05;

export function defaultFacingMarker(): FacingMarkerSpec {
  return {
    angleDeg: 90,
    style: 'triangleUp',
    widthMm: DEFAULT_FACING_MARKER_WIDTH,
    lineWidthMm: DEFAULT_FACING_MARKER_LINE_WIDTH,
  };
}

/**
 * The classic arc marking for games with a 180 degree front arc: the two
 * arc boundary marks on the side diameter plus a front-center triangle,
 * front pointing along +Y.
 */
export function frontArcMarkers(): FacingMarkerParams {
  return {
    depth: DEFAULT_FACING_MARKER_DEPTH,
    markers: [
      {
        angleDeg: 0,
        style: 'topNotch',
        widthMm: DEFAULT_FACING_MARKER_WIDTH,
        lineWidthMm: DEFAULT_FACING_MARKER_LINE_WIDTH,
      },
      {
        angleDeg: 180,
        style: 'topNotch',
        widthMm: DEFAULT_FACING_MARKER_WIDTH,
        lineWidthMm: DEFAULT_FACING_MARKER_LINE_WIDTH,
      },
      {
        angleDeg: 90,
        style: 'triangleUp',
        widthMm: DEFAULT_FACING_MARKER_WIDTH,
        lineWidthMm: DEFAULT_FACING_MARKER_LINE_WIDTH,
      },
    ],
  };
}

/**
 * The marker cross-section in the wall plane as simple counterclockwise
 * polygons: x runs along the wall tangent centered on the marker angle,
 * y runs up the wall from 0 at the bottom rim to wallHeight at the top.
 * Notch styles return two polygons (line plus triangle) that overlap on
 * purpose; consumers cut them independently or union them.
 */
export function markerProfilePolygons(
  spec: FacingMarkerSpec,
  wallHeight: number,
): [number, number][][] {
  const half = spec.widthMm / 2;
  const over = PROFILE_OVERSHOOT;
  const low = -over;
  const high = wallHeight + over;
  const lineHalf = spec.lineWidthMm / 2;
  const notchHeight = Math.min(spec.widthMm * NOTCH_HEIGHT_RATIO, wallHeight / 2);
  const lineRect = (halfWidth: number): [number, number][] => [
    [-halfWidth, low],
    [halfWidth, low],
    [halfWidth, high],
    [-halfWidth, high],
  ];
  switch (spec.style) {
    case 'line':
      return [lineRect(lineHalf)];
    case 'triangleUp':
      return [
        [
          [-half, low],
          [half, low],
          [0, high],
        ],
      ];
    case 'triangleDown':
      return [
        [
          [-half, high],
          [0, low],
          [half, high],
        ],
      ];
    case 'topNotch':
      return [
        lineRect(lineHalf),
        [
          [-half, high],
          [0, wallHeight - notchHeight],
          [half, high],
        ],
      ];
    case 'bottomNotch':
      return [
        lineRect(lineHalf),
        [
          [-half, low],
          [half, low],
          [0, notchHeight],
        ],
      ];
  }
}
