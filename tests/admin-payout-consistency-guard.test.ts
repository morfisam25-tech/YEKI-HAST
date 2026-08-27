import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../services/api/src/routes/admin-payouts.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/payouts/page.tsx', import.meta.url), 'utf8');

test('payout consistency diagnostics compare stored payout amount with attached source total', () => {
  assert.match(route, /COALESCE\(SUM\(pi\.amount_minor\),0\)::text AS source_total_minor/);
  assert.match(route, /source_total_mismatch/);
  assert.match(route, /Number\(row\.source_count\) < 1/);
  assert.match(route, /no_sources/);
});

test('payout consistency diagnostics detect earning market drift and source-state drift', () => {
  assert.match(route, /e\.market_id IS DISTINCT FROM p\.market_id/);
  assert.match(route, /earning_market_mismatch/);
  assert.match(route, /p\.status::text='paid' AND e\.status::text<>'paid'/);
  assert.match(route, /p\.status::text IN \('created','processing','failed'\) AND e\.status::text<>'available'/);
  assert.match(route, /p\.status::text='paid' AND g\.status::text<>'settled'/);
  assert.match(route, /p\.status::text IN \('created','processing','failed'\) AND g\.status::text<>'eligible'/);
  assert.match(route, /source_state_mismatch/);
});

test('payout consistency diagnostics detect deterministic provider and paid-at contradictions', () => {
  assert.match(route, /provider_state_mismatch/);
  assert.match(route, /paid_at_mismatch/);
  assert.match(route, /p\.status::text='created' AND \(p\.provider IS NOT NULL OR p\.provider_reference IS NOT NULL\)/);
  assert.match(route, /p\.status::text IN \('processing','failed','paid'\) AND p\.provider IS NULL/);
});

test('consistency diagnostics remain read-only and do not expose private provider or bank values', () => {
  const listStart = route.indexOf('export async function listAdminPayouts');
  const prepareStart = route.indexOf('export async function prepareAdminPayout');
  const list = route.slice(listStart, prepareStart);
  assert.match(list, /consistencyDiagnosticsReadOnly: true/);
  assert.doesNotMatch(list, /UPDATE app\.|INSERT INTO app\.|DELETE FROM app\./);
  assert.doesNotMatch(list, /providerReference:\s*row\./);
  assert.doesNotMatch(list, /bankIban|accountHolderName|decryptPrivateText/);
});

test('admin UI surfaces consistency issues and blocks created payout dispatch while issues exist', () => {
  assert.match(page, /PAYOUT CONSISTENCY/);
  assert.match(page, /consistencyIssues/);
  assert.match(page, /Consistency:/);
  assert.match(page, /payout\.consistencyIssues\.length > 0/);
  assert.match(page, /payout\.kycStatus !== 'verified' \|\| payout\.consistencyIssues\.length > 0/);
  assert.match(page, /هیچ repair یا تغییر مالی خودکار انجام نمی‌دهد/);
});
