import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/calls/page.tsx', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('admin diagnostics surface active calls with ambiguous cancellation termination', () => {
  assert.match(anomalies, /const cancelTerminationUncertain = await query/);
  assert.match(anomalies, /metadata->>'reason'='cancel_termination_result_uncertain'/);
  assert.match(anomalies, /cs\.status::text = ANY\(\$1::text\[\]\)/);
  assert.match(anomalies, /cancelTerminationUncertain:/);
});

test('termination ambiguity is explicitly reconciliation-only with no provider retry permission', () => {
  assert.match(anomalies, /providerTerminationRetryAllowed: false/);
  assert.match(anomalies, /reconciliationRequired: true/);
  assert.match(page, /Termination نیازمند Reconcile/);
  assert.match(page, /cancel_termination_result_uncertain/);
  assert.match(page, /provider termination retry ممنوع/);
  assert.doesNotMatch(page, /retry-termination|terminate-again|force-terminate/);
});

test('ambiguous cancellation preserves active state and reservation until provider truth is known', () => {
  const terminate = calls.indexOf("await telephony.terminateCall(row.provider_bridge_id, 'caller_cancelled')");
  const uncertainReturn = calls.indexOf("return { kind: 'termination_uncertain'", terminate);
  const release = calls.indexOf('reserved_minor=reserved_minor-$3::bigint', uncertainReturn);
  assert.ok(terminate >= 0 && uncertainReturn > terminate && release > uncertainReturn);
  const uncertain = calls.slice(terminate, uncertainReturn + 120);
  assert.doesNotMatch(uncertain, /SET status='cancelled'/);
  assert.doesNotMatch(uncertain, /reserved_minor=reserved_minor-/);
});

test('a recorded cancellation ambiguity blocks blind termination retry', () => {
  const prior = calls.indexOf("metadata->>'reason'='cancel_termination_result_uncertain'");
  const guard = calls.indexOf("telephony_termination_reconcile_required", prior);
  const termination = calls.indexOf("await telephony.terminateCall(row.provider_bridge_id, 'caller_cancelled')", guard);
  assert.ok(prior >= 0 && guard > prior && termination > guard);
});

test('admin cancellation diagnostics are read-only and keep bridge identity private', () => {
  assert.match(anomalies, /providerBridgeIdsIncluded: false/);
  assert.match(anomalies, /diagnosticsReadOnly: true/);
  assert.doesNotMatch(anomalies, /providerBridgeId\s*:/);
  assert.doesNotMatch(anomalies, /\bUPDATE\b|\bDELETE\b/);
});
