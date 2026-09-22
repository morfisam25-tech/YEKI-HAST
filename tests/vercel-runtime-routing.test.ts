import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  rewrites?: Array<{ source: string; destination: string }>;
};
const runtimeSource = await readFile(new URL('../api/runtime.ts', import.meta.url), 'utf8');

test('Vercel keeps proven readiness/bootstrap routes on index and sends remaining v1 traffic to static runtime', () => {
  assert.deepEqual(vercel.rewrites, [
    { source: '/health', destination: '/api/index' },
    { source: '/ready', destination: '/api/index' },
    { source: '/v1/bootstrap', destination: '/api/index' },
    { source: '/v1/:path*', destination: '/api/runtime' },
  ]);
});

test('runtime entrypoint binds owner-test isolation before loading the backend handler', () => {
  const initializeAt = runtimeSource.indexOf('isInternalOwnerTestMode();');
  const handlerImportAt = runtimeSource.indexOf("await import('../services/api/src/handler.ts')");

  assert.ok(initializeAt >= 0);
  assert.ok(handlerImportAt > initializeAt);
  assert.doesNotMatch(runtimeSource, /import \{ handleApiRequest \} from/);
});
