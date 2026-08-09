import type { BaseParams, ShapeSpec } from '../params/types.ts';
import { GW_OVAL_SIZES } from '../params/types.ts';

export function shapeSlug(shape: ShapeSpec): string {
  switch (shape.kind) {
    case 'round':
      return `round-${shape.diameter}`;
    case 'oval':
      return `oval-${shape.length}x${shape.width}`;
    case 'gwOval': {
      const { length, width } = GW_OVAL_SIZES[shape.preset];
      return `gw-oval-${length}x${width}`;
    }
    case 'pill':
      return `pill-${shape.length}x${shape.width}`;
    case 'square':
      return `square-${shape.size}`;
    case 'rect':
      return `rect-${shape.length}x${shape.width}`;
  }
}

export function baseFilenameSlug(params: BaseParams): string {
  let slug: string;
  if (params.shape.kind === 'converter') {
    slug = `converter-${shapeSlug(params.shape.outer)}-to-${shapeSlug(params.shape.insert)}`;
  } else if (params.shape.kind === 'freeform') {
    slug = `freeform-${params.shape.mode}`;
  } else {
    slug = shapeSlug(params.shape);
  }
  return `${slug}-h${params.height}`;
}
