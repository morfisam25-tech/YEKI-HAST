import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const requestRoute = await readFile(new URL('../apps/web/app/api/auth/request/route.ts', import.meta.url), 'utf8');
const verifyRoute = await readFile(new URL('../apps/web/app/api/auth/verify/route.ts', import.meta.url), 'utf8');

test('Web email auth proxies reject oversized declared bodies and overlong email input', () => {
  for (const route of [requestRoute, verifyRoute]) {
    assert.match(route, /MAX_AUTH_BODY_BYTES = 4_096/);
    assert.match(route, /content-length/);
    assert.match(route, /payload_too_large/);
    assert.match(route, /MAX_EMAIL_LENGTH = 254/);
    assert.match(route, /email\.length > MAX_EMAIL_LENGTH/);
  }
});
