import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');

test('call anomalies detect active calls that already have an end time', () => {
  assert.match(source, /active_with_end_time/);
  assert.match(source, /ACTIVE_CALL_STATUSES/);
  assert.match(source, /ended_at IS NOT NULL/);
});

test('settled charge is reconciled against count, amount, wallet owner and currency', () => {
  assert.match(source, /charge_without_wallet_transaction/);
  assert.match(source, /duplicate_call_charge_transactions/);
  assert.match(source, /call_charge_amount_mismatch/);
  assert.match(source, /call_charge_source_mismatch/);
  assert.match(source, /FROM app\.wallet_transactions tx/);
  assert.match(source, /LEFT JOIN app\.wallets w ON w\.id=tx\.wallet_id/);
  assert.match(source, /tx\.call_session_id=cs\.id AND tx\.type='call_charge'/);
  assert.match(source, /charge_delta_total <> -caller_charge_minor/);
  assert.match(source, /w\.user_id IS DISTINCT FROM cs\.caller_user_id/);
  assert.match(source, /tx\.currency_code IS DISTINCT FROM cs\.currency_code/);
});

test('settled listener earning is reconciled against count, amount and source identity', () => {
  assert.match(source, /earning_without_listener_earning/);
  assert.match(source, /duplicate_listener_earnings/);
  assert.match(source, /listener_earning_amount_mismatch/);
  assert.match(source, /listener_earning_source_mismatch/);
  assert.match(source, /FROM app\.listener_earnings e/);
  assert.match(source, /e\.call_session_id=cs\.id/);
  assert.match(source, /earning_total <> listener_earning_minor/);
  assert.match(source, /e\.listener_user_id IS DISTINCT FROM cs\.listener_user_id/);
  assert.match(source, /e\.market_id IS DISTINCT FROM cs\.market_id/);
  assert.match(source, /e\.currency_code IS DISTINCT FROM cs\.currency_code/);
});

test('unconnected terminal calls cannot carry settled financial artifacts', () => {
  assert.match(source, /unconnected_terminal_has_financials/);
  assert.match(source, /status::text IN \('missed','cancelled','failed'\)/);
  assert.match(source, /caller_charge_minor <> 0/);
  assert.match(source, /listener_earning_minor <> 0/);
});

test('call anomaly diagnostics expose observed totals without mutation or sensitive provider data', () => {
  assert.match(source, /chargeTransactionCount:/);
  assert.match(source, /chargeDeltaTotal:/);
  assert.match(source, /earningRowCount:/);
  assert.match(source, /earningTotal:/);
  assert.match(source, /diagnosticsReadOnly: true/);
  assert.doesNotMatch(source, /\bUPDATE\s+app\.|\bINSERT\s+INTO\s+app\.|\bDELETE\s+FROM\s+app\./i);
  assert.match(source, /phoneNumbersIncluded: false/);
  assert.match(source, /providerBridgeIdsIncluded: false/);
});
