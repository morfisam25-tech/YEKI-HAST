import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/calls/page.tsx', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('admin diagnostics surface every unresolved active cancellation termination state', () => {
  assert.match(anomalies, /const cancelTerminationPending = await query/);
  assert.match(anomalies, /cancel_termination_started/);
  assert.match(anomalies, /cancel_termination_result_uncertain/);
  assert.match(anomalies, /cancel_termination_confirmed/);
  assert.match(anomalies, /cs\.status::text = ANY\(\$1::text\[\]\)/);
  assert.match(anomalies, /cancelTerminationPending:/);
});

test('termination state classification distinguishes provider reconciliation from safe local finalize retry', () => {
  assert.match(anomalies, /'confirmed_local_finalize_pending'/);
  assert.match(anomalies, /'uncertain'/);
  assert.match(anomalies, /'started_unresolved'/);
  assert.match(anomalies, /providerTerminationRetryAllowed: false/);
  assert.match(anomalies, /localFinalizeRetryAllowed: row\.termination_state === 'confirmed_local_finalize_pending'/);
  assert.match(page, /LOCAL FINALIZE READY/);
  assert.match(page, /RECONCILE · termination result uncertain/);
  assert.match(page, /RECONCILE · termination started, result missing/);
});

test('provider retry is never offered from admin while confirmed state documents local-only retry', () => {
  assert.match(page, /Provider termination retry همیشه ممنوع است/);
  assert.match(page, /retry مسیر cancel فقط local DB\/wallet finalization را انجام می‌دهد/);
  assert.doesNotMatch(page, /retry-termination|terminate-again|force-terminate/);
});

test('two-phase cancellation keeps financial finalization after provider confirmation', () => {
  const started = calls.indexOf('cancel_termination_started');
  const terminate = calls.indexOf("await preparation.telephony.terminateCall(preparation.providerBridgeId, 'caller_cancelled')");
  const confirmed = calls.indexOf('cancel_termination_confirmed', terminate);
  const release = calls.indexOf('reserved_minor=reserved_minor-$3::bigint', confirmed);
  assert.ok(started >= 0 && terminate > started && confirmed > terminate && release > confirmed);
});

test('started or uncertain cancellation blocks blind provider termination retry', () => {
  assert.match(calls, /reasons\.has\('cancel_termination_result_uncertain'\) \|\| reasons\.has\('cancel_termination_started'\)/);
  assert.match(calls, /telephony_termination_reconcile_required/);
});

test('admin cancellation diagnostics are read-only and keep bridge identity private', () => {
  assert.match(anomalies, /providerBridgeIdsIncluded: false/);
  assert.match(anomalies, /diagnosticsReadOnly: true/);
  assert.doesNotMatch(anomalies, /providerBridgeId\s*:/);
  assert.doesNotMatch(anomalies, /\bUPDATE\b|\bDELETE\b/);
});
