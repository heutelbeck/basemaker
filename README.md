# Basemaker

Browser-based parametric generator for tabletop miniature bases, movement trays, and basing decorations, with smooth, print-ready output.

**Live app: [heutelbeck.github.io/basemaker](https://heutelbeck.github.io/basemaker/)**

All geometry is computed client-side. The live preview and the STL/3MF exports use the Manifold kernel (WASM) with chord-tolerance-driven tessellation, so curved sides have no visible facets. The STEP export uses the OCCT kernel (via replicad) and carries true analytic curves; slicers like Bambu Studio, OrcaSlicer, and PrusaSlicer tessellate it at import with their own precision.

## Generators

- **Base**: round, oval, GW oval presets, pill, square, rectangle, hex (measured across flats), converter (pocket that accepts another base with true parallel clearance), and freeform footprints drawn in the app (straight polygon, smooth spline, or circles joined by a tangent hull)
- **Movement tray**: pockets for any base shape with rim and gap; formations: ranked block, the official Bretonnian lance wedge (rank r holds r + 1 knights; the tray body is a stepped union of per-rank frustums, never a diagonal hull), and loose skirmish with offset rows; rotated pockets for cavalry frontage; sheet inlay recess on the underside or in the pocket floors
- **Adapter tray**: WHFB-to-TOW style conversion trays; the tray occupies exactly the target base grid while each cell pockets a donor base; optional engraved score lines mark the target base edges
- **Tactical rock**: boulder clusters built from ground-emerging displaced domes (a main outcrop plus seeded satellites) with Gaussian lobes, two-scale crevice ridges, a configurable jaggedness ridge field, and a noise-textured but level mounting plateau that blends smoothly into the sides
- **Crystal cluster**: druse-style clusters that radiate from the center so shafts intergrow naturally instead of crossing; tilted crystals are seated fully into the pad and the cluster is ground-cut flat
- **Plants**: support-free grass tufts and reeds that splay radially without crossing, plus ultra-detail toadstools (bulbous stems, filled annulus skirts, corrugated gills, warted caps) aimed at resin printers; mushrooms never intersect - ones that cannot fit their cap clearance are skipped

The decoration generators share an organic base pad with a configurable radius, so a wide mushroom field or crystal garden is a parameter, not a hack.

## Base features

- Height, GW-style edge slope (nominal size at the bottom rim, sides taper inward going up), optional rounded lip; defaults follow dimensions measured from an original WHFB/TOW infantry base (3.4 mm height, 1.3 mm slope, 1.1 mm hollow wall)
- Hollow underside with wall and top thickness; support pillars or a rib grid that merges flush into the rim wall
- Magnet slots: round or rectangular with padding and housing pillars; layouts: a classic centered line, a grid across the footprint, or an equal-area centroidal Voronoi distribution (the default)
- Recessed top and slotta through-slot (GW-style diagonal placement supported; validation blocks slots that would cut into magnet housings)
- Lettering: embedded (flush inlay) or raised text on the top face or the side wall of round bases; three bundled faces plus any locally installed system font via the Local Font Access API (Chromium); letters export as their own colored part
- Side plaque: a riveted steel plate (configurable thickness and rivet height) or an ornate parchment scroll (torn edges, rippling sheet, end rolls with knobs) on the side wall of any base shape, with or without lettering; placement snaps to one flat side on straight-edged bases and to the wide or narrow side of ovals
- Surface textures modeled on real groundwork: cobblestones (Lloyd-relaxed field stone, running-bond courses, or analytic peacock fans with keystone centers), planks with cathedral-ring grain and knots, ponds and impact craters carved as one continuous basin field with seamless shores, cracked earth plates, and steel deck plates with rivets or anti-slip tread; all are anti-aliased heightfields - the slicer handles the layers
- Dimension feedback: technical-drawing measurements on the canvas and an overall size readout in the viewport
- Overhang check: highlights faces steeper than the printable cone and reports the unsupported area; multi-part jobs offer an exploded 3MF that lays every part flat

## Exports

- **STL**: single fused solid (embedded letters engraved, raised letters and plaques included)
- **3MF**: one assembly object whose parts (body, plaque, lettering) are pre-assigned to filament slots 1 to 3 via Bambu/Orca compatible metadata, so multi-material slicers map colors on import
- **STEP**: a compound of true B-rep solids for the same parts, with analytic curves throughout (plaque sheets are smooth lofts, letters exactly fill their engravings); filament assignment is manual because STEP carries no slicer metadata
- Resolution: chord tolerance slider (0.002 to 0.2 mm) with Draft/High/Ultra presets and a live segment-count readout; applies to STL/3MF only - STEP is always smooth
- Exports of the previewed design reuse cached geometry; an indeterminate progress bar with elapsed time covers the longer STEP builds

## Library and collections

- Game library with standard sizes and trays for Warhammer 40k, Age of Sigmar, The Old World, and legacy Warhammer Fantasy, including lance trays of 3/6/10/15 knights
- Collection manager: save, load, rename, delete named designs; JSON export/import; saved designs migrate automatically across app versions
- Storage backends: browser localStorage (default) or the user's own Google Drive app data folder

## Development

- `npm run dev` - start the dev server
- `npm run build` - type-check and build to `dist/`
- `npm run preview` - serve the production build
- `npm test` - run the geometry, validation, and export test suite
- `npm run lint` - ESLint (type-checked) over src and test
- `npm run format` - Prettier over the whole tree
- `node scripts/make-step-base.mjs out.step` - generate a sample STEP base from Node
- `node scripts/make-step-base.mjs --smoke` - STEP smoke test across shapes, features, plaques, and trays

## Architecture

- `src/params/` - parameter model, presets, validation, and all pure 2D math (outlines, polygons, Voronoi, noise, magnet layouts); imports nothing from the layers below
- `src/geometry/` - Manifold-based solid construction (features, heightfields, decorations, lettering); `src/geometry/step/` holds the OCCT/replicad B-rep builders that share geometric specs with the mesh path
- `src/generators/` - job union (base, trays, decorations), game library, filenames
- `src/export/` - binary STL and multi-part 3MF writers
- `src/worker/` - geometry web worker (comlink), debouncing client, and the export geometry cache
- `src/preview/` - three.js viewport
- `src/state/` - zustand store, collection storage backends (localStorage, Google Drive)
- `src/ui/` - React panels and controls

## Deployment (GitHub Pages)

Two workflows live in `.github/workflows/`:

- `ci.yml` lints, tests, builds, and runs the STEP backend smoke on every push and pull request.
- `pages.yml` builds and deploys `dist/` to GitHub Pages on pushes to `main`. Enable it once under repository Settings > Pages > Source: GitHub Actions.

The site deploys to `https://heutelbeck.github.io/basemaker/` (project repositories serve under `https://<user>.github.io/<repo>/`). HTTPS is automatic.

### Google Drive sign-in

The OAuth client id is injected at deploy time, never hard coded:

1. In the Google Cloud console (Google Auth Platform), register the app, add the `drive.appdata` scope under Data access, and publish it.
2. Create a Web application OAuth client with authorized JavaScript origins `https://heutelbeck.github.io` (scheme and host only, no path) and your local dev origin (for example `http://localhost:5173`).
3. Put the client id in a repository variable named `DRIVE_CLIENT_ID` (Settings > Secrets and variables > Actions > Variables). Client ids for browser apps are public identifiers; the client secret is never used - the app runs the browser token flow and only ever holds a short-lived access token.

Without the variable, the Drive panel falls back to asking the user for a client id, so self-hosted deployments keep working.

## License

Basemaker is MIT licensed (see `LICENSE`). All bundled libraries are compatible: MIT and Apache-2.0 dependencies impose only attribution, and the LGPL-2.1 OpenCascade kernel is used unmodified as a dynamically loaded WASM module, which satisfies its relinking requirement.

## Licenses of bundled components

- Manifold (manifold-3d): Apache-2.0
- OpenCascade via replicad-opencascadejs: LGPL-2.1 with OCCT exception (used unmodified as a dynamically loaded WASM module)
- replicad: MIT
- opentype.js: MIT
- DejaVu fonts (dejavu-fonts-ttf): DejaVu Fonts License (free)
