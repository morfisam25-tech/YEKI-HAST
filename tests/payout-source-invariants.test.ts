import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const payouts = await readFile(new URL('../services/api/src/routes/payouts.ts', import.meta.url), 'utf8');

test('payout dispatch requires every source item to remain available before provider submission', () => {
  assert.match(payouts, /payout_source_not_available/);
  assert.match(payouts, /e\.status<>'available'/);
  assert.match(payouts, /g\.status<>'eligible'/);
});

test('payout item total must equal payout amount before dispatch and before paid reconciliation', () => {
  const matches = payouts.match(/payout_amount_mismatch/g) ?? [];
  assert.ok(matches.length >= 2);
  assert.match(payouts, /COALESCE\(SUM\(amount_minor\),0\)::text total/);
});

test('paid reconciliation consumes only sources attached to the locked payout', () => {
  assert.match(payouts, /FROM app\.payout_items pi[\s\S]*WHERE pi\.payout_id=\$1 AND pi\.earning_id=e\.id AND e\.status='available'/);
  assert.match(payouts, /WHERE pi\.payout_id=\$1 AND pi\.guarantee_assignment_id=g\.id AND g\.status='eligible'/);
});

test('paid payout reconciliation is idempotent and terminal', () => {
  assert.match(payouts, /if \(row\.status === 'paid'\)/);
  assert.match(payouts, /if \(current\.status === 'paid'\) return/);
  assert.match(payouts, /status='paid'/);
  assert.match(payouts, /paid_at=COALESCE\(paid_at, now\(\)\)/);
});

test('ambiguous payout submit is never blindly retried or failed without a provider code', () => {
  assert.match(payouts, /error\.providerCode !== null/);
  assert.match(payouts, /payout_dispatch_ambiguous/);
  assert.match(payouts, /Never retry or mark failed blindly/);
});
