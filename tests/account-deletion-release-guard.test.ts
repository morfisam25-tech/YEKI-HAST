import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const emailAuth = await readFile(new URL('../services/api/src/routes/auth-email.ts', import.meta.url), 'utf8');
const phoneAuth = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const webProxy = await readFile(new URL('../apps/web/app/api/account/deletion-request/route.ts', import.meta.url), 'utf8');
const webPage = await readFile(new URL('../apps/web/app/account/delete/page.tsx', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

test('pending account deletion blocks creation of new email and phone sessions', () => {
  for (const source of [emailAuth, phoneAuth]) {
    assert.ok(source.includes("action='account_deletion_requested'"));
    assert.ok(source.includes("metadata->>'processingState'='pending'"));
    assert.ok(source.includes("return { kind: 'deletion_pending' };"));
    assert.ok(source.includes("throw new HttpError(409, 'account_deletion_pending')"));

    const pendingCheck = source.indexOf("metadata->>'processingState'='pending'");
    const sessionInsert = source.lastIndexOf('INSERT INTO private_data.auth_sessions');
    assert.ok(pendingCheck > -1 && sessionInsert > pendingCheck, 'deletion-pending check must happen before session creation');
  }
});

test('Web deletion request is same-origin authenticated and clears the revoked cookie', () => {
  assert.match(webProxy, /browserMutationAllowed\(request\)/);
  assert.match(webProxy, /WEB_SESSION_COOKIE/);
  assert.match(webProxy, /authorization: `Bearer \$\{token\}`/);
  assert.match(webProxy, /\/v1\/account\/deletion-request/);
  assert.match(webProxy, /store\.delete\(WEB_SESSION_COOKIE\)/);
});

test('public Web deletion page requires OTP and an explicit destructive confirmation', () => {
  assert.match(webPage, /\/api\/auth\/request/);
  assert.match(webPage, /\/api\/auth\/verify/);
  assert.match(webPage, /\/api\/account\/deletion-request/);
  assert.match(webPage, /confirmation\.trim\(\) !== 'حذف حساب'/);
  assert.match(webPage, /حذف فوری همه سوابق نیست/);
});

test('production env sync has a first-party deletion URL but keeps legal policy inputs explicit', () => {
  assert.match(envSync, /DEFAULT_ACCOUNT_DELETION_URL = 'https:\/\/web-unique-6ff0\.vercel\.app\/account\/delete'/);
  assert.match(envSync, /provided\('PRODUCTION_PRIVACY_POLICY_URL'\)/);
  assert.match(envSync, /provided\('PRODUCTION_TERMS_OF_SERVICE_URL'\)/);
  assert.match(envSync, /provided\('PRODUCTION_SUPPORT_EMAIL'\)/);
});
