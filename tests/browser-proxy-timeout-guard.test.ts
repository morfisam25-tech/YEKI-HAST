import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const files = [
  '../apps/web/app/api/_backend.ts',
  '../apps/admin/app/api/_backend.ts',
];

test('browser backend proxies have a bounded upstream request timeout without overriding caller aborts', async () => {
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /BACKEND_REQUEST_TIMEOUT_MS\s*=\s*15_000/);
    assert.match(source, /signal:\s*init\.signal\s*\?\?\s*AbortSignal\.timeout\(BACKEND_REQUEST_TIMEOUT_MS\)/);
  }
});
