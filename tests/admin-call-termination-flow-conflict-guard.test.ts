import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/calls/page.tsx', import.meta.url), 'utf8');

const cancelReasons = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
];
const safetyReasons = [
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

test('admin diagnostics identify historical calls containing both termination flows', () => {
  assert.match(anomalies, /const terminationFlowConflicts = await query/);
  assert.match(anomalies, /BOOL_OR\(ce\.metadata->>'reason' = ANY\(\$1::text\[\]\)\) AS has_cancel/);
  assert.match(anomalies, /BOOL_OR\(ce\.metadata->>'reason' = ANY\(\$2::text\[\]\)\) AS has_safety/);
  assert.match(anomalies, /WHERE has_cancel AND has_safety/);
  for (const reason of [...cancelReasons, ...safetyReasons]) assert.match(anomalies, new RegExp(reason));
  assert.doesNotMatch(anomalies, /metadata->>'reason' LIKE/);
});

test('termination flow conflict is reconciliation-only with no provider retry or automatic repair', () => {
  assert.match(anomalies, /terminationFlowConflicts:/);
  assert.match(anomalies, /reconciliationRequired: true/);
  assert.match(anomalies, /providerTerminationRetryAllowed: false/);
  assert.match(anomalies, /automaticRepairAllowed: false/);
  assert.match(anomalies, /diagnosticsReadOnly: true/);
  assert.match(page, /terminationFlowConflicts: number/);
  assert.match(page, /termination_flow_conflict/);
  assert.match(page, /automatic repair ممنوع/);
});
