import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');
const recovery = await readFile(new URL('../services/api/src/routes/admin-call-recovery.ts', import.meta.url), 'utf8');
const dispatch = await readFile(new URL('../services/api/src/routes/call-dispatch.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/calls/page.tsx', import.meta.url), 'utf8');

test('calling_caller without bridge is classified as dispatch ambiguity, not a proven bridge invariant', () => {
  assert.match(anomalies, /const dispatchUncertain = await query/);
  assert.match(anomalies, /status::text='calling_caller'[\s\S]*provider_bridge_id IS NULL/);
  assert.match(anomalies, /const missingBridge = await query/);
  assert.match(anomalies, /status::text IN \('caller_answered','calling_listener','connected'\)/);
  const missingBridgeSection = anomalies.slice(anomalies.indexOf('const missingBridge'), anomalies.indexOf('const stalePreconnect'));
  assert.doesNotMatch(missingBridgeSection, /calling_caller/);
});

test('dispatch ambiguity is explicitly reconciliation-only and never advertises provider redispatch', () => {
  assert.match(anomalies, /reconciliationRequired: true/);
  assert.match(anomalies, /providerRedispatchAllowed: false/);
  assert.match(page, /RECONCILE/);
  assert.match(page, /provider redispatch ممنوع/i);
  assert.match(page, /نه Recovery و نه Redispatch خودکار ندارد/);
});

test('admin recovery remains restricted to stale routing only', () => {
  assert.match(recovery, /if \(row\.status !== 'routing'\) throw new HttpError\(409, 'call_recovery_not_safe'\)/);
  assert.match(recovery, /recoveryScope: 'stale_routing_only'/);
  assert.doesNotMatch(recovery, /calling_caller/);
});

test('caller dispatch backend also refuses blind retry from calling_caller', () => {
  assert.match(dispatch, /row\.status === 'calling_caller'/);
  assert.match(dispatch, /throw new HttpError\(503, 'telephony_dispatch_uncertain'\)/);
  assert.match(dispatch, /row\.status !== 'routing'/);
});

test('diagnostics remain read-only and do not expose provider bridge ids', () => {
  assert.match(anomalies, /diagnosticsReadOnly: true/);
  assert.match(anomalies, /providerBridgeIdsIncluded: false/);
  assert.doesNotMatch(anomalies, /providerBridgeId\s*:/);
  assert.doesNotMatch(anomalies, /\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
});
