# Basemaker

Browser-based parametric generator for tabletop miniature bases and trays with smooth, print-ready output.

All geometry is computed client-side. The live preview and the STL/3MF exports use the Manifold kernel (WASM) with chord-tolerance-driven tessellation, so curved sides have no visible facets. The STEP export uses the OCCT kernel (via replicad) and carries true analytic curves (cones, cylinders, ellipses, fillets); slicers like Bambu Studio, OrcaSlicer, and PrusaSlicer tessellate it at import with their own precision.

## Generators

- **Base**: round, oval, GW oval presets, pill, square, rectangle, hex (measured across flats), converter (pocket that accepts another base with true parallel clearance), and freeform footprints drawn in the app (straight polygon, smooth spline, or circles joined by a tangent hull)
- **Movement tray**: pockets for any base shape with rim and gap; formations: ranked block, Bretonnian lance wedge, loose skirmish (offset rows); rotated pockets for cavalry frontage; sheet inlay recess on the underside (one hidden sheet) or in the pocket floors (pieces directly under the bases)
- **Adapter tray**: WHFB-to-TOW style conversion trays; the tray occupies exactly the target base grid while each cell pockets a donor base; optional engraved score lines mark where the target base edges line up
- **Tactical rock**: fractal heightfield outcrops (ridge noise over an irregular footprint) with a flat bottom and a guaranteed level mounting plateau; heightfields cannot overhang, so rocks always print support-free
- **Crystal cluster**: druse-style clusters that radiate from the center (vertical in the middle, leaning outward toward the edge) so shafts intergrow naturally instead of crossing; tilts stay inside the printable cone
- **Plants**: support-free grass tufts and reeds that splay radially without crossing, plus smooth revolved toadstools with 40 degree cap undersides; FDM and resin printability profiles (these three generators are mesh-only; STEP export explains why)

## Base features

- Height, GW-style edge slope (nominal size at the bottom rim, sides taper inward going up), optional rounded lip (top edge roundover, exported as a true fillet in STEP)
- Hollow underside with wall and top thickness
- Magnet slots: round or rectangular, multiple with spacing, offsets, padding, housing pillars inside hollow bases
- Recessed top and slotta through-slot (with a surrounding rim wall inside hollow bases; validation blocks slots that would cut into magnet holders)
- Rim lettering: engraved or embossed text along the rim of round bases, on the top face or the side wall, in three bundled font faces; letters render in their color in the preview and export as a second colored 3MF object for multi-material printers
- Resolution: chord tolerance slider (0.002 to 0.2 mm) with Draft/High/Ultra presets and a live segment-count readout
- Surface textures modeled on real groundwork: cobblestone laid as a Lloyd-relaxed Voronoi joint network, running-bond courses, or peacock fans (tight mortar gaps, optional domed sett tops); planks with engraved grain and worn irregular ends; multiple randomly placed irregular ponds with graded shores and raised banks; impact craters with ejecta rims; fine lava crack networks; steel deck plates with rivet rows or anti-slip tread
- Dimension feedback: the drawing canvas shows technical-drawing bounding-box measurements, and the 3D viewport shows the overall size in mm
- Overhang check: a viewport toggle highlights downward faces steeper than the 50 degree printable cone in red and reports the unsupported area; multi-part jobs offer an exploded 3MF that lays every part flat on the plate

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

## Deployment (GitHub Pages)

Two workflows live in `.github/workflows/`:

- `ci.yml` lints, tests, builds, and runs the STEP backend smoke on every push and pull request.
- `pages.yml` builds and deploys `dist/` to GitHub Pages on pushes to `main`. Enable it once under repository Settings > Pages > Source: GitHub Actions.

The site URL is `https://heutelbeck.github.io/basemaker/` (project repositories deploy under `https://<user>.github.io/<repo>/`; only a repository named `<user>.github.io` serves at the root). HTTPS is automatic.

The Google Drive OAuth client id is injected at deploy time, never hard coded: create a repository variable named `DRIVE_CLIENT_ID` (Settings > Secrets and variables > Actions > Variables) holding the OAuth web client id. In the Google Cloud console, the client's authorized JavaScript origins must be `https://heutelbeck.github.io` (origins are scheme and host only, without the `/basemaker` path) plus `http://localhost:5200` for development. No client secret is used anywhere: the browser token flow authenticates with the public client id alone. Without the variable the Drive panel falls back to asking the user for a client id.
