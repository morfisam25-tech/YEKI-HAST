import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../apps/admin/app/readiness/page.tsx', import.meta.url), 'utf8');
const backend = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');

test('admin readiness UI surfaces aggregate Caller launch verdict and configured-vs-effective beta state', () => {
  assert.match(page, /callerLaunch\.ready/);
  assert.match(page, /READY TO OPEN/);
  assert.match(page, /callerClosedBeta\.enabled/);
  assert.match(page, /callerClosedBeta\.configured/);
  assert.match(page, /BETA ENABLED/);
  assert.match(page, /BETA BLOCKED/);
  assert.match(page, /BETA DISABLED/);
});

test('Caller launch readiness remains fail-closed on every primary-transport dependency', () => {
  assert.match(backend, /const callerLaunchReady = callerClosedBetaConfigured/);
  assert.match(backend, /&& commercialHostingApproved/);
  assert.match(backend, /&& callerAgePolicyReady/);
  assert.match(backend, /&& callerCatalogReady/);
  assert.match(backend, /&& accountAuthReady/);
  assert.match(backend, /&& callTransportReady/);
  assert.match(backend, /&& paymentReady/);
  assert.match(backend, /&& sensitiveDataReady/);
  assert.match(backend, /&& adminBootstrapLockedDown/);
  assert.match(backend, /&& publicRelease\.ready/);
  const callerLaunchBlock = backend.match(/const callerLaunchReady =[\s\S]*?;/)?.[0] ?? '';
  assert.doesNotMatch(callerLaunchBlock, /callPhoneVerificationReady/);
  assert.doesNotMatch(callerLaunchBlock, /telephonyReady/);
  assert.doesNotMatch(callerLaunchBlock, /smsReady/);
});

test('admin readiness UI surfaces hosting, auth, phone, catalog and sensitive-data readiness without credential values', () => {
  assert.match(page, /commercialHosting: Integration/);
  assert.match(page, /emailAuth: Integration/);
  assert.match(page, /accountAuth: Integration/);
  assert.match(page, /callPhoneVerification: Integration/);
  assert.match(page, /sensitiveData: Integration/);
  assert.match(page, /callerCatalog: Integration/);
  assert.match(page, /\['commercialHosting', 'میزبانی تجاری'\]/);
  assert.match(page, /\['emailAuth', 'ورود با ایمیل'\]/);
  assert.match(page, /\['accountAuth', 'ورود حساب'\]/);
  assert.match(page, /\['callPhoneVerification', 'تأیید شماره تماس'\]/);
  assert.match(page, /\['sensitiveData', 'امنیت داده حساس'\]/);
  assert.match(page, /\['callerCatalog', 'کاتالوگ و قیمت‌گذاری Caller'\]/);
  assert.match(page, /میزبانی برای استفاده تجاری تأیید شده باشد/);
  assert.match(page, /SMS به‌تنهایی الزام مستقل لانچ نیست/);
  assert.doesNotMatch(page, /\b(apiKey|secretKey|password|credential)\s*[:=]/i);
  assert.doesNotMatch(page, /data\.integrations\.[A-Za-z]+\.(apiKey|secretKey|password|credential)/i);
  assert.match(backend, /commercialHosting: \{ ready: commercialHostingApproved \}/);
  assert.match(backend, /emailAuth: \{ provider: emailProvider, ready: emailAuthReady \}/);
  assert.match(backend, /accountAuth: \{ ready: accountAuthReady \}/);
  assert.match(backend, /callPhoneVerification: \{/);
  assert.match(backend, /callTransport: \{/);
  assert.match(backend, /sensitiveData: \{ ready: sensitiveDataReady \}/);
  assert.match(backend, /callerCatalog: \{ ready: callerCatalogReady \}/);
  assert.match(backend, /secretsIncluded: false/);
});
