interface Deletable {
  delete(): void;
}

export type Track = <T extends Deletable>(resource: T) => T;

/**
 * Runs `fn` with a tracking function for WASM-backed geometry objects.
 * Every tracked object except the returned value is deleted afterwards,
 * preventing Emscripten heap leaks across repeated rebuilds. The return
 * value may be a tracked object (kept alive) or plain data.
 */
export function withGeometryScope<T>(fn: (track: Track) => T): T {
  const tracked: Deletable[] = [];
  const track: Track = (resource) => {
    tracked.push(resource);
    return resource;
  };
  let result: T | null = null;
  try {
    result = fn(track);
    return result;
  } finally {
    for (const resource of tracked) {
      if ((resource as unknown) !== (result as unknown)) {
        resource.delete();
      }
    }
  }
}
