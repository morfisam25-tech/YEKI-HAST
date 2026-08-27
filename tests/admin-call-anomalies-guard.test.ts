import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/admin-calls.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/calls/page.tsx', import.meta.url), 'utf8');

test('call anomaly diagnostics are admin-only and read-only', () => {
  assert.match(anomalies, /await requireAdmin\(req\)/);
  assert.doesNotMatch(anomalies, /\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
});

test('call anomaly diagnostics cover deterministic lifecycle and reservation invariants', () => {
  assert.match(anomalies, /provider_bridge_id IS NULL/);
  assert.match(anomalies, /status::text IN \('routing','calling_caller','caller_answered','calling_listener'\)/);
  assert.match(anomalies, /max_billable_seconds/);
  assert.match(anomalies, /w\.reserved_minor < a\.required_reserved_minor/);
});

test('call anomaly diagnostics cover terminal and money invariants without mutating balances', () => {
  assert.match(anomalies, /(?:cs\.)?caller_charge_minor > (?:cs\.)?authorized_minor/);
  assert.match(anomalies, /(?:cs\.)?listener_earning_minor > (?:cs\.)?caller_charge_minor/);
  assert.match(anomalies, /(?:cs\.)?status::text='connected' AND (?:cs\.)?billing_started_at IS NULL/);
  assert.match(anomalies, /(?:cs\.)?status::text IN \('completed','cancelled','failed','safety_terminated'\) AND (?:cs\.)?ended_at IS NULL/);
  assert.match(anomalies, /invariantViolations/);
  assert.doesNotMatch(anomalies, /SET\s+reserved_minor|SET\s+balance_minor/i);
});

test('admin UI surfaces invariant warnings but offers no automatic financial repair action', () => {
  assert.match(page, /invariantViolations/);
  assert.match(page, /Invariant:/);
  assert.doesNotMatch(page, /repair-financial|fix-wallet|force-settlement/);
});

test('call anomaly diagnostics never return provider bridge ids, phone numbers or secrets', () => {
  assert.match(anomalies, /phoneNumbersIncluded: false/);
  assert.match(anomalies, /providerBridgeIdsIncluded: false/);
  assert.match(anomalies, /secretsIncluded: false/);
  assert.doesNotMatch(anomalies, /providerBridgeId\s*:/);
  assert.doesNotMatch(anomalies, /\bphoneE164\s*:|\bphoneNumber\s*:/);
  assert.doesNotMatch(anomalies, /SELECT[\s\S]*\bphone_e164\b/i);
});

test('existing admin calls endpoint exposes anomaly mode without changing public call API', () => {
  assert.match(calls, /searchParams\.get\('anomalies'\) === 'true'/);
  assert.match(calls, /getAdminCallAnomalies\(req, res\)/);
});
