import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../services/api/src/routes/admin-payouts.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');

test('payout preparation is a routed admin-only database operation', () => {
  assert.match(handler, /POST' && url\.pathname === '\/v1\/admin\/payouts\/prepare'/);
  assert.match(handler, /prepareAdminPayout/);
  assert.match(route, /const admin = await requireAdmin\(req\)/);
  assert.match(route, /withTransaction/);
});

test('payout preparation serializes the listener market currency tuple', () => {
  assert.match(route, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.match(route, /yeki_hast:payout_prepare:/);
  assert.match(route, /e\.listener_user_id=\$1/);
  assert.match(route, /e\.market_id=\$2/);
  assert.match(route, /e\.currency_code=\$3/);
});

test('payout preparation touches only available earnings outside a payout', () => {
  const start = route.indexOf('export async function prepareAdminPayout');
  const prepare = route.slice(start);
  assert.match(prepare, /e\.status='available'/);
  assert.match(prepare, /LEFT JOIN app\.payout_items pi ON pi\.earning_id=e\.id/);
  assert.match(prepare, /pi\.id IS NULL/);
  assert.doesNotMatch(prepare, /UPDATE app\.listener_earnings/);
  assert.doesNotMatch(prepare, /status='pending'/);
});

test('payout candidate version makes stale snapshots fail closed and exact retries idempotent', () => {
  assert.match(route, /candidateVersionFor/);
  assert.match(route, /payout_candidate_changed/);
  assert.match(route, /idempotent: true/);
  assert.match(route, /earning_sources/);
  assert.match(route, /expectedEarningCount/);
  assert.match(route, /expectedAvailableMinor/);
});

test('prepare creates payout and payout items atomically without provider or bank access', () => {
  const start = route.indexOf('export async function prepareAdminPayout');
  const prepare = route.slice(start);
  assert.match(prepare, /INSERT INTO app\.payouts\(id, listener_user_id, market_id, currency_code, amount_minor, status\)/);
  assert.match(prepare, /VALUES \(\$1,\$2,\$3,\$4,\$5,'created'\)/);
  assert.match(prepare, /INSERT INTO app\.payout_items\(id, payout_id, listener_user_id, currency_code, earning_id, amount_minor\)/);
  assert.match(prepare, /providerCallIncluded: false/);
  assert.match(prepare, /pendingEarningsTouched: false/);
  assert.match(prepare, /bankDetailsIncluded: false/);
  assert.doesNotMatch(prepare, /getPayoutProvider|provider\.submit|decryptPrivateText|bank_iban/);
});
