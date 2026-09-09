import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-payments.ts', import.meta.url), 'utf8');

test('admin payment monitoring requires admin authentication', () => {
  const list = source.slice(source.indexOf('export async function listAdminPaymentAttempts'), source.indexOf('type AdminCreditDependencies'));
  assert.match(list, /await requireAdmin\(req\)/);
});

test('admin payment status filter is bounded', () => {
  assert.match(source, /allowedStatuses/);
  assert.match(source, /'pending'/);
  assert.match(source, /'succeeded'/);
  assert.match(source, /'failed'/);
  assert.match(source, /'cancelled'/);
  assert.match(source, /invalid_status/);
});

test('admin payment monitoring is read only and cannot credit wallets', () => {
  const list = source.slice(source.indexOf('export async function listAdminPaymentAttempts'), source.indexOf('type AdminCreditDependencies'));
  assert.doesNotMatch(list, /UPDATE app\.wallets/);
  assert.doesNotMatch(list, /INSERT INTO app\.wallet_transactions/);
  assert.doesNotMatch(list, /verifyAndFinalizeAttempt/);
});
