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
  test(`${name} proxy source-locks production and keeps overrides non-production-only`, () => {
    const productionLock = source.indexOf("if (process.env.NODE_ENV === 'production') return PRODUCTION_API_BASE_URL;");
    const envLookup = source.indexOf(`process.env.${envName}`);
    const localhostFallback = source.indexOf("return 'http://localhost:4000';");
    assert.ok(productionLock >= 0 && envLookup > productionLock && localhostFallback > envLookup);
  });

  test(`${name} proxy uses the canonical production API origin`, () => {
    assert.ok(source.includes(currentOrigin));
    assert.doesNotMatch(source, new RegExp(staleOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(source, /return PRODUCTION_API_BASE_URL/);
  });
}
