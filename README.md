# Basemaker

Browser-based parametric generator for tabletop miniature bases and trays with smooth, print-ready output.

All geometry is computed client-side. The live preview and the STL/3MF exports use the Manifold kernel (WASM) with chord-tolerance-driven tessellation, so curved sides have no visible facets. The STEP export uses the OCCT kernel (via replicad) and carries true analytic curves (cones, cylinders, ellipses, fillets); slicers like Bambu Studio, OrcaSlicer, and PrusaSlicer tessellate it at import with their own precision.

## Generators

- **Base**: round, oval, GW oval presets, pill, square, rectangle, converter (pocket that accepts another base with true parallel clearance), and freeform footprints drawn in the app (straight polygon, smooth spline, or circles joined by a tangent hull)
- **Movement tray**: pockets for any base shape with rim and gap; formations: ranked block, Bretonnian lance wedge, loose skirmish (offset rows); rotated pockets for cavalry frontage; sheet inlay recess on the underside (one hidden sheet) or in the pocket floors (pieces directly under the bases)
- **Adapter tray**: WHFB-to-TOW style conversion trays; the tray occupies exactly the target base grid while each cell pockets a donor base; optional engraved score lines mark where the target base edges line up

## Base features

- Height, GW-style edge slope (nominal size at the bottom rim, sides taper inward going up), optional rounded lip (top edge roundover, exported as a true fillet in STEP)
- Hollow underside with wall and top thickness
- Magnet slots: round or rectangular, multiple with spacing, offsets, padding, housing pillars inside hollow bases
- Recessed top and slotta through-slot (with a surrounding rim wall inside hollow bases; validation blocks slots that would cut into magnet holders)
- Rim lettering: engraved or embossed text along the rim of round bases, on the top face or the side wall, in three bundled font faces; letters render in their color in the preview and export as a second colored 3MF object for multi-material printers
- Resolution: chord tolerance slider (0.002 to 0.2 mm) with Draft/High/Ultra presets and a live segment-count readout
- Dimension feedback: the drawing canvas shows technical-drawing bounding-box measurements, and the 3D viewport shows the overall size in mm

## Library and collections

- Game library with standard base sizes for Warhammer 40k, Age of Sigmar, The Old World, and legacy Warhammer Fantasy, including movement and adapter trays
- Collection manager: save, load, rename, delete named designs; JSON export/import
- Storage backends: browser localStorage (default) or the user's own Google Drive app data folder

### Google Drive setup

1. In the Google Cloud console, create a project and enable the Google Drive API.
2. Create an OAuth client id of type Web application and add the site origin (for local use `http://localhost:5173`) as an authorized JavaScript origin.
3. In the app, switch the collection storage to Google Drive, paste the client id, and connect. Collections are stored in the Drive app data folder; the app only ever holds a short-lived access token.

## Commands

- `npm run dev` - start the dev server
- `npm run build` - type-check and build to `dist/`
- `npm run preview` - serve the production build
- `npm test` - run the geometry, validation, and export test suite
- `npm run lint` - ESLint (type-checked) over src and test
- `npm run format` - Prettier over the whole tree
- `node --experimental-strip-types scripts/make-step-base.mjs out.step` - generate a sample STEP base from Node
- `node --experimental-strip-types scripts/make-step-base.mjs --smoke` - STEP smoke test across shapes, features, and trays

## Architecture

- `src/params/` - parameter model, presets, edge profile math, polygon math, validation (pure TS)
- `src/generators/` - job union (base, movement tray, adapter tray), game library, filenames
- `src/geometry/` - Manifold-based solid construction, tessellation, freeform outlines, lettering, mesh extraction (pure TS, runs in worker and Node)
- `src/geometry/step/` - OCCT/replicad B-rep builders for STEP export
- `src/export/` - binary STL and multi-part 3MF writers
- `src/worker/` - geometry web worker (comlink) and debouncing client
- `src/preview/` - three.js viewport
- `src/state/` - zustand store, collection storage backends (localStorage, Google Drive)
- `src/ui/` - React panels and controls

## Licenses of bundled components

- Manifold (manifold-3d): Apache-2.0
- OpenCascade via replicad-opencascadejs: LGPL-2.1 with OCCT exception (used unmodified as a dynamically loaded WASM module)
- replicad: MIT
- opentype.js: MIT
- DejaVu Sans Bold (dejavu-fonts-ttf): DejaVu Fonts License (free)
