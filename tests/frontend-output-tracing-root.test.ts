import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webConfig = await readFile(new URL('../apps/web/next.config.ts', import.meta.url), 'utf8');
const adminConfig = await readFile(new URL('../apps/admin/next.config.ts', import.meta.url), 'utf8');

for (const [label, config] of [
  ['Web', webConfig],
  ['Admin', adminConfig],
] as const) {
  test(`${label} traces production files from the monorepo root`, () => {
    assert.match(config, /from 'node:path'/);
    assert.match(config, /outputFileTracingRoot:\s*resolve\(process\.cwd\(\), '\.\.\/\.\.'\)/);
  });
}
