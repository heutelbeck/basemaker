import type { Shape3D, Wire } from 'replicad';
import { assembleWire, draw, drawRectangle, loft, makeCylinder, makeLine } from 'replicad';
import type { BaseParams } from '../../params/types.ts';
import type { PlaqueSlabSpec } from '../features/plaque.ts';
import {
  plateRivets,
  plateSlabSpec,
  scrollRolls,
  scrollSlabSpec,
  slabCorner,
  wallSlopeRad,
  PLAQUE_EMBED,
} from '../features/plaque.ts';
import type { Point2 } from '../../params/tessellation.ts';
import { asShape3D } from './buildStepShape.ts';

/** Closed planar wire of one slab column cross-section. */
function columnWire(params: BaseParams, spec: PlaqueSlabSpec, u: number): Wire {
  const s = spec.sStart + spec.width * u;
  const { zTop, zBottom, proud } = spec.at(u);
  const corners = [
    slabCorner(params, spec.frame, s, zBottom, proud),
    slabCorner(params, spec.frame, s, zTop, proud),
    slabCorner(params, spec.frame, s, zTop, -PLAQUE_EMBED),
    slabCorner(params, spec.frame, s, zBottom, -PLAQUE_EMBED),
  ];
  return assembleWire([
    makeLine(corners[0], corners[1]),
    makeLine(corners[1], corners[2]),
    makeLine(corners[2], corners[3]),
    makeLine(corners[3], corners[0]),
  ]);
}

/**
 * Smooth B-spline loft through the slab's column sections. Consecutive
 * sections that coincide (the sheet's tips buried inside the rolls) are
 * deduplicated because OCCT's ThruSections rejects identical wires.
 */
function slabLoft(params: BaseParams, spec: PlaqueSlabSpec, sections: number): Shape3D {
  const wires: Wire[] = [];
  let previous: number[] | null = null;
  for (let i = 0; i <= sections; i++) {
    const u = i / sections;
    const s = spec.sStart + spec.width * u;
    const { zTop, zBottom, proud } = spec.at(u);
    const signature = [
      ...spec.frame.pointAt(s),
      zTop,
      zBottom,
      proud,
    ];
    const same =
      previous !== null &&
      signature.every((value, index) => Math.abs(value - (previous as number[])[index]) < 1e-4);
    if (!same) {
      wires.push(columnWire(params, spec, u));
      previous = signature;
    }
  }
  return asShape3D(loft(wires, { ruled: false }));
}

/**
 * The plaque as a true B-rep solid for STEP export: the plate or the
 * scroll sheet is a smooth loft through the same cross-sections the mesh
 * uses, rivets are cylinders along the leaned wall normal, and scroll
 * rolls are revolved profiles with spherical end knobs. Returns null when
 * no plaque is configured.
 */
export function buildStepPlaque(params: BaseParams, bottomOutline: Point2[]): Shape3D | null {
  const plaque = params.plaque;
  if (plaque === null) {
    return null;
  }
  if (plaque.style === 'plate') {
    const spec = plateSlabSpec(params, plaque, bottomOutline);
    let solid = slabLoft(params, spec, Math.min(48, spec.columns));
    for (const rivet of plateRivets(params, plaque, spec)) {
      const stud = makeCylinder(
        rivet.radius,
        rivet.length,
        [rivet.startX, rivet.startY, rivet.startZ],
        [rivet.dirX, rivet.dirY, rivet.dirZ],
      );
      solid = asShape3D(solid.fuse(stud));
    }
    return clampToHeightBand(solid, params);
  }
  const spec = scrollSlabSpec(params, plaque, bottomOutline);
  let solid = slabLoft(params, spec, Math.min(72, spec.columns));
  const slopeDeg = (wallSlopeRad(params) * 180) / Math.PI;
  for (const roll of scrollRolls(params, plaque, spec)) {
    const profile = draw([0, -roll.length / 2])
      .lineTo([roll.radius, -roll.length / 2])
      .lineTo([roll.radius, roll.length / 2])
      .lineTo([0, roll.length / 2])
      .close();
    let rollSolid = asShape3D(profile.sketchOnPlane('XZ').revolve());
    for (const knobCenter of [roll.knobTopCenter, roll.knobBottomCenter]) {
      const knobProfile = draw([0, knobCenter - roll.knobRadius])
        .sagittaArcTo([0, knobCenter + roll.knobRadius], roll.knobRadius)
        .close();
      const knob = asShape3D(knobProfile.sketchOnPlane('XZ').revolve());
      rollSolid = asShape3D(rollSolid.fuse(knob));
    }
    const placed = asShape3D(
      asShape3D(
        asShape3D(rollSolid.rotate(-slopeDeg, [0, 0, 0], [0, 1, 0])).rotate(
          (roll.azimuthRad * 180) / Math.PI,
          [0, 0, 0],
          [0, 0, 1],
        ),
      ).translate([roll.anchorX, roll.anchorY, roll.centerZ]),
    );
    solid = asShape3D(solid.fuse(placed));
  }
  return clampToHeightBand(solid, params);
}

/** Same top and bottom flushness guarantee as the mesh backend. */
function clampToHeightBand(solid: Shape3D, params: BaseParams): Shape3D {
  const band = asShape3D(
    drawRectangle(4000, 4000)
      .sketchOnPlane('XY', 0.02)
      .extrude(params.height - 0.02),
  );
  return asShape3D(solid.intersect(band));
}
