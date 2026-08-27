import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../services/api/src/routes/admin-payouts.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/payouts/page.tsx', import.meta.url), 'utf8');
const payoutRoute = await readFile(new URL('../services/api/src/routes/payouts.ts', import.meta.url), 'utf8');

test('admin payout queue flags only stale processing dispatches without provider reference', () => {
  assert.match(backend, /AMBIGUOUS_DISPATCH_MINUTES = 5/);
  assert.match(backend, /p\.status::text='processing'/);
  assert.match(backend, /p\.provider IS NOT NULL/);
  assert.match(backend, /p\.provider_reference IS NULL/);
  assert.match(backend, /dispatchNeedsReconciliation/);
});

test('provider references and bank details remain private in admin payout response', () => {
  assert.match(backend, /providerReferencesIncluded: false/);
  assert.match(backend, /bankDetailsIncluded: false/);
  assert.doesNotMatch(backend, /providerReference:\s*row\./);
  assert.doesNotMatch(backend, /bankIban|accountHolderName/);
});

test('ambiguous payout UI instructs reconciliation instead of blind redispatch', () => {
  assert.match(page, /dispatchNeedsReconciliation/);
  assert.match(page, /RECONCILE/);
  assert.match(page, /دوباره Dispatch نکن/);
  assert.match(page, /'reconcile'/);
});

test('dispatch route preserves ambiguous provider outcomes for later reconciliation', () => {
  assert.match(payoutRoute, /payout_dispatch_ambiguous/);
  assert.match(payoutRoute, /providerCode !== null/);
  assert.match(payoutRoute, /payout_provider_rejected/);
  assert.match(payoutRoute, /\['processing', 'failed'\]\.includes\(row\.status\)/);
});
