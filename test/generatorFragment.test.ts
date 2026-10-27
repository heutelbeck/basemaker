import { describe, expect, it } from 'vitest';
import type { GeneratorId } from '../src/generators/job.ts';
import { GENERATOR_LABELS, generatorFromSlug, generatorSlug } from '../src/generators/job.ts';

describe('generator in the URL fragment', () => {
  it('names every generator with a link-friendly slug that leads back to it', () => {
    for (const id of Object.keys(GENERATOR_LABELS) as GeneratorId[]) {
      const slug = generatorSlug(id);
      expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(generatorFromSlug(slug)).toBe(id);
      expect(generatorFromSlug(`#${slug}`)).toBe(id);
    }
  });

  it('opens the paint rack from a shared link', () => {
    expect(generatorFromSlug('#paint-rack')).toBe('paintRack');
  });

  it('ignores an empty or unknown fragment', () => {
    expect(generatorFromSlug('')).toBeNull();
    expect(generatorFromSlug('#')).toBeNull();
    expect(generatorFromSlug('#paintRack')).toBeNull();
    expect(generatorFromSlug('#Paint-Rack')).toBeNull();
  });
});
