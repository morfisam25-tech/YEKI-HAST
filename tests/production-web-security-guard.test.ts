import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webVercel = JSON.parse(await readFile(new URL('../apps/web/vercel.json', import.meta.url), 'utf8'));
const adminVercel = JSON.parse(await readFile(new URL('../apps/admin/vercel.json', import.meta.url), 'utf8'));
const webBackend = await readFile(new URL('../apps/web/app/api/_backend.ts', import.meta.url), 'utf8');
const adminBackend = await readFile(new URL('../apps/admin/app/api/_backend.ts', import.meta.url), 'utf8');
const webVerify = await readFile(new URL('../apps/web/app/api/auth/verify/route.ts', import.meta.url), 'utf8');
const adminVerify = await readFile(new URL('../apps/admin/app/api/auth/verify/route.ts', import.meta.url), 'utf8');
const sharedHttp = await readFile(new URL('../services/api/src/lib/http.ts', import.meta.url), 'utf8');
const vercelApiEntry = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');

function headersFor(config: any): Map<string, string> {
  const catchAll = config.headers?.find((entry: any) => entry.source === '/(.*)');
  assert.ok(catchAll, 'catch-all security headers are required');
  return new Map((catchAll.headers ?? []).map((header: any) => [String(header.key).toLowerCase(), String(header.value)]));
}

test('Web and Admin deny framing and restrict browser capabilities by default', () => {
  for (const config of [webVercel, adminVercel]) {
    const headers = headersFor(config);
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.get('referrer-policy'), 'no-referrer');
    assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(headers.get('permissions-policy'), 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');

    const csp = headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /form-action 'self'/);
    assert.match(csp, /connect-src 'self'/);
    assert.doesNotMatch(csp, /https?:\/\//);
  }
});


test('Web voice routes allow microphone only where live audio is used', () => {
  const routePolicies = new Map(
    webVercel.headers
      .filter((entry: any) => ['/talk', '/booking/call', '/listener/work'].includes(entry.source))
      .map((entry: any) => [entry.source, new Map((entry.headers ?? []).map((header: any) => [String(header.key).toLowerCase(), String(header.value)]))]),
  );

  for (const route of ['/talk', '/booking/call', '/listener/work']) {
    assert.equal(routePolicies.get(route)?.get('permissions-policy'), 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()');
  }
});

test('production browser sessions use __Host cookies and strict cookie attributes', () => {
  assert.match(webBackend, /NODE_ENV === 'production' \? '__Host-yeki_web_session' : 'yeki_web_session'/);
  assert.match(adminBackend, /NODE_ENV === 'production' \? '__Host-yeki_admin_session' : 'yeki_admin_session'/);

  for (const verifyRoute of [webVerify, adminVerify]) {
    assert.match(verifyRoute, /httpOnly: true/);
    assert.match(verifyRoute, /secure: process\.env\.NODE_ENV === 'production'/);
    assert.match(verifyRoute, /sameSite: 'strict'/);
    assert.match(verifyRoute, /path: '\/'/);
    assert.doesNotMatch(verifyRoute, /domain:/);
  }
});

test('all API JSON response helpers explicitly deny sniffing framing and referrer leakage', () => {
  for (const source of [sharedHttp, vercelApiEntry]) {
    assert.match(source, /x-content-type-options/);
    assert.match(source, /nosniff/);
    assert.match(source, /referrer-policy/);
    assert.match(source, /no-referrer/);
    assert.match(source, /x-frame-options/);
    assert.match(source, /DENY/);
    assert.match(source, /content-security-policy/);
    assert.match(source, /default-src 'none'/);
    assert.match(source, /cache-control/);
    assert.match(source, /no-store/);
  }
});
