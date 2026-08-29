import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const webSource = await readFile(new URL('../apps/web/app/api/_backend.ts', import.meta.url), 'utf8');
const adminSource = await readFile(new URL('../apps/admin/app/api/_backend.ts', import.meta.url), 'utf8');
const currentOrigin = 'https://yeki-hast-theta.vercel.app';
const staleOrigin = 'https://yeki-hast.vercel.app';

for (const [name, source, envName] of [
  ['web', webSource, 'WEB_API_BASE_URL'],
  ['admin', adminSource, 'ADMIN_API_BASE_URL'],
] as const) {
  test(`${name} proxy keeps an explicit environment override`, () => {
    assert.ok(source.includes(`process.env.${envName}`));
  });

  test(`${name} proxy has a safe canonical production fallback`, () => {
    assert.ok(source.includes(currentOrigin));
    assert.doesNotMatch(source, new RegExp(staleOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(source, /if \(process\.env\.NODE_ENV !== 'production'\) return 'http:\/\/localhost:4000'/);
    assert.match(source, /return PRODUCTION_API_BASE_URL/);
  });
}
