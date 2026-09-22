import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const web = await readFile(new URL('../apps/web/app/api/_backend.ts', import.meta.url), 'utf8');
const admin = await readFile(new URL('../apps/admin/app/api/_backend.ts', import.meta.url), 'utf8');

for (const [name, source, envName] of [
  ['web', web, 'WEB_API_BASE_URL'],
  ['admin', admin, 'ADMIN_API_BASE_URL'],
] as const) {
  test(`${name} browser proxy source-locks the production API target via explicit environment identity`, () => {
    const productionLock = source.indexOf("if (env === 'production') return PRODUCTION_API_BASE_URL;");
    const envLookup = source.indexOf(`process.env.${envName}`);
    assert.ok(productionLock >= 0 && envLookup > productionLock);
    assert.match(source, /import \{ isProductionOrigin, resolveAppEnv \} from '\.\/_env\.ts';/);
    assert.doesNotMatch(source, /if \(process\.env\.NODE_ENV === 'production'\) return PRODUCTION_API_BASE_URL;/);
    assert.match(source, /PRODUCTION_API_BASE_URL = 'https:\/\/yeki-hast-unique-6ff0\.vercel\.app'/);
    assert.match(source, /BACKEND_REQUEST_TIMEOUT_MS = 15_000/);
    assert.match(source, /AbortSignal\.timeout\(BACKEND_REQUEST_TIMEOUT_MS\)/);
  });
}
