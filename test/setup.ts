import { afterEach } from 'vitest';

// The geometry tests are long synchronous WASM runs, and vitest only awaits
// microtasks between tests. Without a turn of the event loop the worker
// never reads the replies to its progress reports, and on a slow machine a
// test file runs past their 60 s timeout.
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
