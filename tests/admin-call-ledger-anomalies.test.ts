import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');

test('call anomalies detect active calls that already have an end time', () => {
  assert.match(source, /active_with_end_time/);
  assert.match(source, /'requested','routing','calling_caller','caller_answered','calling_listener','connected'/);
  assert.match(source, /ended_at IS NOT NULL/);
});

test('settled charge requires a matching wallet call-charge transaction', () => {
  assert.match(source, /charge_without_wallet_transaction/);
  assert.match(source, /FROM app\.wallet_transactions wt/);
  assert.match(source, /wt\.call_session_id=cs\.id AND wt\.type='call_charge'/);
});

test('settled listener earning requires a matching earning row', () => {
  assert.match(source, /earning_without_listener_earning/);
  assert.match(source, /FROM app\.listener_earnings le/);
  assert.match(source, /le\.call_session_id=cs\.id/);
});

test('call anomaly diagnostics remain read-only', () => {
  assert.doesNotMatch(source, /\bUPDATE\s+app\.|\bINSERT\s+INTO\s+app\.|\bDELETE\s+FROM\s+app\./i);
  assert.match(source, /phoneNumbersIncluded: false/);
  assert.match(source, /providerBridgeIdsIncluded: false/);
});
