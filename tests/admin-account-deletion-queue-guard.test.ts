import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../services/api/src/routes/admin-account-deletion.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/account-deletions/page.tsx', import.meta.url), 'utf8');
const layout = await readFile(new URL('../apps/admin/app/layout.tsx', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../apps/admin/app/api/ops/[...path]/route.ts', import.meta.url), 'utf8');

test('Admin deletion queue is authenticated and wired read-only', () => {
  assert.match(handler, /GET' && url\.pathname === '\/v1\/admin\/account-deletion-requests'/);
  assert.match(handler, /listAdminAccountDeletionRequests/);
  assert.match(route, /requireAdmin\(req\)/);
  assert.match(route, /action='account_deletion_requested'/);
  assert.match(route, /processingState/);
  assert.match(route, /piiIncluded: false/);
  assert.match(proxy, /ADMIN_SESSION_COOKIE/);
  assert.match(proxy, /authorization: `Bearer \$\{token\}`/);
});

test('Admin deletion queue returns no email phone identity or banking payload', () => {
  assert.match(route, /entity_id::text AS user_id/);
  assert.match(route, /metadata->>'processingState' AS processing_state/);
  assert.doesNotMatch(route, /user_emails|user_contacts|email_ciphertext|phone_e164_ciphertext|email_hash|phone_hash|national_id|iban|sheba|bank/i);
  assert.doesNotMatch(route, /SELECT[\s\S]*private_data\./i);
});

test('Admin deletion page exposes no destructive final-delete action', () => {
  assert.match(page, /\/api\/ops\/account-deletion-requests/);
  assert.match(page, /PII NOT INCLUDED/);
  assert.match(page, /عمداً عملیات «حذف نهایی» ندارد/);
  assert.match(page, /processingState === 'pending'/);
  assert.doesNotMatch(page, /method:\s*'POST'/);
  assert.doesNotMatch(page, /حذف کامل شد/);
  assert.match(layout, /href="\/account-deletions"/);
});
