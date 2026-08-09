// CLI seed for the STEP backend. Runs the shared B-rep builder under Node:
//   node --experimental-strip-types scripts/make-step-base.mjs out.step
//   node --experimental-strip-types scripts/make-step-base.mjs --smoke
// The emscripten bundle of OCCT declares itself as an ES module but relies
// on CommonJS globals under Node, so a CommonJS-converted copy is staged
// into node_modules/.cache before loading.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setOC } from 'replicad';

const require = createRequire(import.meta.url);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function stageCommonJsBundle() {
  const stagedDir = join(projectRoot, 'node_modules', '.cache', 'basemaker-occt');
  const stagedJs = join(stagedDir, 'replicad_single.cjs');
  const stagedWasm = join(stagedDir, 'replicad_single.wasm');
  if (!existsSync(stagedJs)) {
    mkdirSync(stagedDir, { recursive: true });
    const source = readFileSync(
      require.resolve('replicad-opencascadejs/src/replicad_single.js'),
      'utf8',
    );
    writeFileSync(stagedJs, source.replace('export default Module;', 'module.exports = Module;'));
    copyFileSync(require.resolve('replicad-opencascadejs/src/replicad_single.wasm'), stagedWasm);
  }
  return { stagedJs, stagedWasm };
}

const { stagedJs, stagedWasm } = stageCommonJsBundle();
const opencascade = require(stagedJs);
const OC = await opencascade({ locateFile: () => stagedWasm });
setOC(OC);

const { initFontFromBuffer } = await import('../src/geometry/lettering/font.ts');
const fontBuffer = readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'));
const font = initFontFromBuffer(
  fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength),
);

const { buildStepShape } = await import('../src/geometry/step/buildStepShape.ts');
const { buildStepAdapterTray, buildStepMovementTray } =
  await import('../src/geometry/step/buildStepTray.ts');
const { defaultAdapterTrayParams, defaultMovementTrayParams } =
  await import('../src/params/trays.ts');
const { defaultParams } = await import('../src/params/types.ts');

function testBase() {
  return {
    ...defaultParams(),
    shape: { kind: 'round', diameter: 110 },
    height: 3,
    edgeSlope: 1.5,
    hollow: { wall: 2, topThickness: 1.2, supports: null },
  };
}

async function writeStep(params, path) {
  const shape = buildStepShape(params);
  const blob = shape.blobSTEP();
  writeFileSync(path, Buffer.from(await blob.arrayBuffer()));
  console.log('Wrote', path);
}

if (process.argv[2] === '--smoke') {
  const cases = [
    ['round', { ...defaultParams() }],
    ['oval', { ...defaultParams(), shape: { kind: 'oval', length: 60, width: 35 } }],
    ['pill', { ...defaultParams(), shape: { kind: 'pill', length: 60, width: 25 } }],
    ['square', { ...defaultParams(), shape: { kind: 'square', size: 30 }, edgeSlope: 1 }],
    ['lipped', { ...defaultParams(), lipRadius: 1 }],
    [
      'supported-hollow',
      {
        ...defaultParams(),
        shape: { kind: 'round', diameter: 80 },
        hollow: { wall: 2, topThickness: 1.2, supports: { spacing: 15, diameter: 3 } },
      },
    ],
    [
      'featured',
      {
        ...defaultParams(),
        shape: { kind: 'round', diameter: 50 },
        height: 5,
        hollow: { wall: 2, topThickness: 1.5, supports: null },
        magnets: {
          shape: 'round',
          diameter: 5,
          length: 5,
          width: 5,
          depth: 2,
          count: 2,
          spacing: 16,
          offsetX: 0,
          offsetY: 0,
          padding: 0.8,
        },
        recess: { depth: 1, inset: 2 },
        slotta: { length: 20, width: 3, angleDeg: 30, offsetX: 0, offsetY: 0 },
      },
    ],
    [
      'converter',
      {
        ...defaultParams(),
        shape: {
          kind: 'converter',
          outer: { kind: 'round', diameter: 50 },
          insert: { kind: 'square', size: 25 },
          insertDepth: 3,
          clearance: 0.15,
        },
        height: 5,
      },
    ],
  ];
  const lettering = {
    text: 'HERO',
    sizeMm: 4,
    depth: 0.6,
    margin: 2,
    angleDeg: -90,
    colorHex: '#e8833a',
    style: 'engraved',
    placement: 'top',
    font: 'sans',
  };
  cases.push(
    ['lettered-top', { ...defaultParams(), shape: { kind: 'round', diameter: 40 }, lettering }],
    [
      'lettered-side-embossed',
      {
        ...defaultParams(),
        shape: { kind: 'round', diameter: 40 },
        lettering: { ...lettering, placement: 'side', style: 'embossed', sizeMm: 2.5 },
      },
    ],
  );
  for (const [name, params] of cases) {
    const shape = buildStepShape(params, font);
    const blob = shape.blobSTEP();
    const bytes = (await blob.arrayBuffer()).byteLength;
    console.log(`${name}: STEP ${bytes} bytes`);
  }
  const trayCases = [
    ['movement-tray', buildStepMovementTray({ ...defaultMovementTrayParams(), rows: 2 })],
    ['adapter-tray', buildStepAdapterTray(defaultAdapterTrayParams())],
    [
      'round-movement-tray',
      buildStepMovementTray({
        ...defaultMovementTrayParams(),
        pocketShape: { kind: 'round', diameter: 32 },
        gap: 1,
      }),
    ],
  ];
  for (const [name, shape] of trayCases) {
    const blob = shape.blobSTEP();
    const bytes = (await blob.arrayBuffer()).byteLength;
    console.log(`${name}: STEP ${bytes} bytes`);
  }
} else {
  const target = process.argv[2] ?? 'test-base.step';
  await writeStep(testBase(), target);
}
