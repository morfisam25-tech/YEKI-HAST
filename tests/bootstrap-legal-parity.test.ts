import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const lightweight = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../services/api/src/routes/bootstrap.ts', import.meta.url), 'utf8');

for (const [name, source] of [['lightweight', lightweight], ['canonical', canonical]] as const) {
  test(`${name} bootstrap uses the shared validated public-release config`, () => {
    assert.match(source, /getPublicReleaseConfig/);
    assert.match(source, /legal:\s*getPublicReleaseConfig\(\)/);
  });
}
