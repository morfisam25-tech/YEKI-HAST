import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-payments.ts', import.meta.url), 'utf8');

test('admin payment monitoring requires admin authentication', () => {
  assert.match(source, /await requireAdmin\(req\)/);
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
  assert.doesNotMatch(source, /UPDATE app\.wallets/);
  assert.doesNotMatch(source, /INSERT INTO app\.wallet_transactions/);
  assert.doesNotMatch(source, /verifyAndFinalizeAttempt/);
});
