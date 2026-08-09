import { describe, expect, it } from 'vitest';
import { jobFilename, validateJob } from '../src/generators/job.ts';
import { GAME_LIBRARY } from '../src/generators/library.ts';
import { buildJobMesh } from '../src/generators/job.ts';
import { getManifold } from '../src/geometry/manifoldContext.ts';

describe('game library', () => {
  it.each(GAME_LIBRARY.map((entry) => [`${entry.system}: ${entry.name}`, entry] as const))(
    'entry %s validates cleanly',
    (_label, entry) => {
      expect(validateJob(entry.job)).toEqual([]);
    },
  );

  it('builds a valid solid for every library entry', async () => {
    const wasm = await getManifold();
    for (const entry of GAME_LIBRARY) {
      const solid = await buildJobMesh(wasm, entry.job);
      expect(solid.status()).toBe('NoError');
      expect(solid.volume()).toBeGreaterThan(0);
      solid.delete();
    }
  });

  it('derives a filename for every entry', () => {
    for (const entry of GAME_LIBRARY) {
      expect(jobFilename(entry.job, 'stl')).toMatch(/^[a-z0-9.x-]+\.stl$/);
    }
  });
});
