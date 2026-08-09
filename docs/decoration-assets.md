# Decoration asset research

Findings on free, permissively licensed 3D assets usable as bundled base
decorations (barrels, crates, rocks, plants, scatter), and how they relate
to the built-in procedural generators.

## Recommended CC0 sources (no attribution required, commercial use fine)

- **Poly Haven** (https://polyhaven.com, CC0): photoreal scans. The
  Namaqualand collection alone has 10 rock scans, 5 branch and debris
  scans, and over 10 plant sets - ideal raw material for scenic bases.
  High poly counts; would need decimation before bundling.
- **Quaternius** (https://quaternius.com, CC0): large stylized low-poly
  packs including nature, rocks, and props. Low poly counts suit direct
  bundling, but the style is more video game than tabletop.
- **Kenney** (https://kenney.nl, CC0): tens of thousands of game-ready
  assets in consistent styles, including nature and prop packs.
- **awesome-cc0** (https://github.com/madjin/awesome-cc0): maintained
  index of further CC0 asset sources.

## Sources that need per-model license checks

- **Printables and Cults3D** host many free basing bits (barrels, crates,
  small rock sets), but licenses vary per model; most free downloads are
  personal-use or CC-BY-NC and must NOT be bundled or redistributed by the
  app. Individual CC0/CC-BY models exist and would need case-by-case
  vetting with recorded provenance.
- **MyMiniFactory / Gumroad starter packs** (for example Battle Bits skull
  and mushroom scatter): typically free to download but not freely
  redistributable.

## Integration plan

1. The procedural generators now cover the highest-value categories
   natively (tactical rocks with flat mounting spots, crystals, grass,
   reeds, mushrooms) with zero license risk and perfect print guarantees.
2. For sculpted props (barrels, crates, trash), curate a small CC0 pack
   (Poly Haven scans decimated to about 5k triangles, or Kenney and
   Quaternius props), record source and license per mesh in a manifest,
   and bundle as watertight, pre-scaled STL-derived meshes.
3. Any bundled mesh must be verified manifold (repair through the Manifold
   kernel) and placed via the future decoration-instance system (position,
   rotation, scale on the base top with a seeded scatter option).
