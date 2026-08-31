import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../services/api/src/routes/admin-account-deletion.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/account-deletions/page.tsx', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../apps/admin/app/api/ops/[...path]/route.ts', import.meta.url), 'utf8');

test('admin deletion queue is wired only through an authenticated admin route', () => {
  assert.match(handler, /GET' && url\.pathname === '\/v1\/admin\/account-deletion-requests'/);
  assert.match(handler, /listAdminAccountDeletionRequests/);
  assert.match(route, /await requireAdmin\(req\)/);
  assert.match(proxy, /ADMIN_SESSION_COOKIE/);
  assert.match(proxy, /authorization: `Bearer \$\{token\}`/);
});

test('admin deletion queue returns no email phone or identity payload', () => {
  assert.match(route, /entity_id::text AS user_id/);
  assert.match(route, /metadata->>'processingState' AS processing_state/);
  assert.match(route, /piiIncluded: false/);
  assert.doesNotMatch(route, /email_ciphertext|phone_ciphertext|email_hash|phone_hash|national_id|bank|iban|sheba/i);
  assert.doesNotMatch(route, /SELECT[\s\S]*private_data\./i);
});

test('admin deletion UI is read-only and does not pretend final deletion exists', () => {
  assert.match(page, /PII NOT INCLUDED/);
  assert.match(page, /عملیات «حذف نهایی» ندارد/);
  assert.match(page, /processingState === 'pending'/);
  assert.doesNotMatch(page, /fetch\([^\n]*method:\s*'POST'/);
  assert.doesNotMatch(page, /حذف کامل شد/);
});
