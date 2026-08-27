import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/services/call-lifecycle.ts', import.meta.url), 'utf8');

test('provider lifecycle binds callbacks to the persisted bridge id', () => {
  assert.match(source, /row\.provider_bridge_id !== input\.providerBridgeId/);
  assert.match(source, /provider_bridge_mismatch/);
});

test('connected transition starts billing once and records telephony event', () => {
  assert.match(source, /status='connected'/);
  assert.match(source, /billing_started_at=COALESCE\(billing_started_at,\$2\)/);
  assert.match(source, /VALUES \(\$1,'connected','telephony'\)/);
});

test('settlement caps provider duration to wallet-authorized duration', () => {
  assert.match(source, /Math\.min\(input\.connectedSeconds, row\.max_billable_seconds\)/);
  assert.match(source, /settlement_exceeds_authorized_seconds/);
  assert.match(source, /settlement_exceeds_authorization/);
});

test('caller wallet charge and reserve release happen atomically', () => {
  assert.match(source, /withTransaction/);
  assert.match(source, /balance_minor=balance_minor-\$2::bigint/);
  assert.match(source, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.match(source, /'call_charge'/);
  assert.match(source, /`call:\$\{row\.id\}:charge`/);
});

test('listener earning is created once as pending until payout eligibility policy releases it', () => {
  assert.match(source, /INSERT INTO app\.listener_earnings/);
  assert.match(source, /VALUES \(\$1,\$2,\$3,\$4,\$5,'pending'\)/);
});

test('settlement persists billing facts and uses terminal state as idempotency boundary', () => {
  assert.match(source, /row\.status === 'completed'/);
  assert.match(source, /billable_seconds=\$4/);
  assert.match(source, /caller_charge_minor=\$5/);
  assert.match(source, /listener_earning_minor=\$6/);
  assert.match(source, /source='telephony'/);
});
