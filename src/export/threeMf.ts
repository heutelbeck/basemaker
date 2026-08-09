import { strToU8, zipSync } from 'fflate';
import type { RawMesh } from '../geometry/mesh.ts';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="text/xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

export interface ThreeMfPart {
  name: string;
  colorHex: string;
  mesh: RawMesh;
}

function normalizeColor(colorHex: string): string {
  const hex = colorHex.startsWith('#') ? colorHex.slice(1) : colorHex;
  const padded = /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '8A8A8A';
  return `#${padded}FF`;
}

/**
 * 3MF requires plain decimal numbers; JavaScript stringifies tiny floats
 * in exponent notation, which strict parsers reject, so coordinates are
 * emitted with fixed precision and trimmed.
 */
function coord(value: number): string {
  if (Math.abs(value) < 5e-5) {
    return '0';
  }
  return value.toFixed(4).replace(/\.?0+$/, '');
}

function appendMeshXml(parts: string[], mesh: RawMesh): void {
  const { positions, indices } = mesh;
  parts.push('   <mesh>\n    <vertices>\n');
  for (let v = 0; v < positions.length; v += 3) {
    parts.push(
      `     <vertex x="${coord(positions[v])}" y="${coord(positions[v + 1])}" z="${coord(positions[v + 2])}"/>\n`,
    );
  }
  parts.push('    </vertices>\n    <triangles>\n');
  for (let t = 0; t < indices.length; t += 3) {
    parts.push(
      `     <triangle v1="${indices[t]}" v2="${indices[t + 1]}" v3="${indices[t + 2]}"/>\n`,
    );
  }
  parts.push('    </triangles>\n   </mesh>\n');
}

/**
 * Serializes one or more named, colored parts as a minimal 3MF package
 * with explicit millimeter units. The parts are components of a single
 * assembly object with one build item, so slicers load them as one model
 * whose parts keep their alignment and can each be assigned a filament.
 */
export function writeThreeMfParts(modelParts: ThreeMfPart[]): Uint8Array {
  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"',
    ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n',
    ' <resources>\n',
    '  <basematerials id="1">\n',
  );
  for (const part of modelParts) {
    parts.push(`   <base name="${part.name}" displaycolor="${normalizeColor(part.colorHex)}"/>\n`);
  }
  parts.push('  </basematerials>\n');
  modelParts.forEach((part, index) => {
    parts.push(
      `  <object id="${index + 2}" name="${part.name}" type="model" pid="1" pindex="${index}">\n`,
    );
    appendMeshXml(parts, part.mesh);
    parts.push('  </object>\n');
  });
  const assemblyId = modelParts.length + 2;
  if (modelParts.length > 1) {
    parts.push(`  <object id="${assemblyId}" name="assembly" type="model">\n   <components>\n`);
    modelParts.forEach((_, index) => {
      parts.push(`    <component objectid="${index + 2}"/>\n`);
    });
    parts.push('   </components>\n  </object>\n');
  }
  parts.push(' </resources>\n <build>\n');
  parts.push(`  <item objectid="${modelParts.length > 1 ? assemblyId : 2}"/>\n`);
  parts.push(' </build>\n</model>\n');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(parts.join('')),
  };
  if (modelParts.length > 1) {
    files['Metadata/model_settings.config'] = strToU8(modelSettings(modelParts, assemblyId));
  }
  return zipSync(files);
}

/**
 * Bambu Studio and Orca Slicer ignore core-spec basematerials; they map
 * parts to filament slots through this proprietary Metadata file, keyed
 * by the component object ids of the assembly. Extruder slots are
 * assigned 1-based in part order (body, plaque, lettering).
 */
function modelSettings(modelParts: ThreeMfPart[], assemblyId: number): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<config>\n',
    `  <object id="${assemblyId}">\n`,
    '    <metadata key="name" value="model"/>\n',
  ];
  modelParts.forEach((part, index) => {
    lines.push(
      `    <part id="${index + 2}" subtype="normal_part">\n`,
      `      <metadata key="name" value="${part.name}"/>\n`,
      `      <metadata key="extruder" value="${index + 1}"/>\n`,
      '    </part>\n',
    );
  });
  lines.push('  </object>\n', '</config>\n');
  return lines.join('');
}

/** Single-object convenience wrapper. */
export function writeThreeMf(mesh: RawMesh): Uint8Array {
  return writeThreeMfParts([{ name: 'model', colorHex: '#8A8A8A', mesh }]);
}
