import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const nextConfig = await readFile(new URL('../apps/web/next.config.ts', import.meta.url), 'utf8');
const requestRoute = await readFile(new URL('../apps/web/app/api/auth/request/route.ts', import.meta.url), 'utf8');
const verifyRoute = await readFile(new URL('../apps/web/app/api/auth/verify/route.ts', import.meta.url), 'utf8');
const logoutRoute = await readFile(new URL('../apps/web/app/api/auth/logout/route.ts', import.meta.url), 'utf8');

test('Web keeps a server runtime while browser auth uses POST Route Handlers', () => {
  for (const route of [requestRoute, verifyRoute, logoutRoute]) {
    assert.match(route, /export async function POST\(/);
  }
  assert.doesNotMatch(nextConfig, /output\s*:\s*['"]export['"]/);
});
