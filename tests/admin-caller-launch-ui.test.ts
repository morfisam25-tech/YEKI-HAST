import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../apps/admin/app/readiness/page.tsx', import.meta.url), 'utf8');
const backend = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');

test('admin readiness UI surfaces aggregate Caller launch verdict', () => {
  assert.match(page, /callerLaunch\.ready/);
  assert.match(page, /READY TO OPEN/);
  assert.match(page, /callerClosedBeta\.enabled/);
  assert.match(page, /BETA ENABLED/);
  assert.match(page, /BETA DISABLED/);
});

test('Caller launch readiness remains fail-closed on every required dependency', () => {
  assert.match(backend, /const callerLaunchReady = callerClosedBetaEnabled/);
  assert.match(backend, /&& callerAgePolicyReady/);
  assert.match(backend, /&& callerCatalogReady/);
  assert.match(backend, /&& smsReady/);
  assert.match(backend, /&& paymentReady/);
  assert.match(backend, /&& telephonyReady/);
  assert.match(backend, /&& sensitiveDataReady/);
});

test('admin readiness UI surfaces catalog and sensitive-data readiness without credential values', () => {
  assert.match(page, /sensitiveData: Integration/);
  assert.match(page, /callerCatalog: Integration/);
  assert.match(page, /\['sensitiveData', 'امنیت داده حساس'\]/);
  assert.match(page, /\['callerCatalog', 'کاتالوگ و قیمت‌گذاری Caller'\]/);
  assert.match(page, /کاتالوگ و قیمت‌گذاری، SMS/);
  assert.doesNotMatch(page, /\b(apiKey|secretKey|password|credential)\s*[:=]/i);
  assert.doesNotMatch(page, /data\.integrations\.[A-Za-z]+\.(apiKey|secretKey|password|credential)/i);
  assert.match(backend, /sensitiveData: \{ ready: sensitiveDataReady \}/);
  assert.match(backend, /callerCatalog: \{ ready: callerCatalogReady \}/);
  assert.match(backend, /secretsIncluded: false/);
});
