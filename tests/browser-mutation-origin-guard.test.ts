import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { browserMutationAllowed as adminMutationAllowed } from '../apps/admin/app/api/_backend.ts';
import { browserMutationAllowed as webMutationAllowed } from '../apps/web/app/api/_backend.ts';

const guards = [webMutationAllowed, adminMutationAllowed];

function request(headers: Record<string, string> = {}) {
  return new Request('https://client.example/api/auth/request', { method: 'POST', headers });
}

test('browser mutation guard allows exact same-origin requests', () => {
  for (const allowed of guards) {
    assert.equal(allowed(request({ origin: 'https://client.example', 'sec-fetch-site': 'same-origin' })), true);
  }
});

test('browser mutation guard rejects cross-origin and same-site browser mutations', () => {
  for (const allowed of guards) {
    assert.equal(allowed(request({ origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' })), false);
    assert.equal(allowed(request({ origin: 'https://client.example', 'sec-fetch-site': 'same-site' })), false);
    assert.equal(allowed(request({ origin: 'null', 'sec-fetch-site': 'cross-site' })), false);
  }
});

test('browser mutation guard fails closed without browser metadata in production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const allowed of guards) assert.equal(allowed(request()), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('all browser POST proxy routes invoke the mutation guard', async () => {
  const routes = [
    '../apps/web/app/api/auth/request/route.ts',
    '../apps/web/app/api/auth/verify/route.ts',
    '../apps/web/app/api/auth/logout/route.ts',
    '../apps/admin/app/api/auth/request/route.ts',
    '../apps/admin/app/api/auth/verify/route.ts',
    '../apps/admin/app/api/auth/logout/route.ts',
    '../apps/admin/app/api/ops/[...path]/route.ts',
  ];
  for (const route of routes) {
    const source = await readFile(new URL(route, import.meta.url), 'utf8');
    assert.match(source, /browserMutationAllowed\(request\)/, route);
    assert.match(source, /forbidden_origin/, route);
  }
});
