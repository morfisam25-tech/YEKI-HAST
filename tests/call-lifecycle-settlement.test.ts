import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const lifecycle = await readFile(new URL('../services/api/src/services/call-lifecycle.ts', import.meta.url), 'utf8');
const safety = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');
const mobile = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');

test('provider lifecycle cannot skip caller/listener transition order', () => {
  assert.match(lifecycle, /fromStatus: 'calling_caller'/);
  assert.match(lifecycle, /toStatus: 'caller_answered'/);
  assert.match(lifecycle, /fromStatus: 'caller_answered'/);
  assert.match(lifecycle, /toStatus: 'calling_listener'/);
  assert.match(lifecycle, /row\.status !== 'calling_listener'/);
  assert.match(lifecycle, /provider_bridge_mismatch/);
});

test('stale caller-answered callback is idempotent after listener dialing already started', () => {
  assert.match(lifecycle, /input\.toStatus === 'caller_answered' && row\.status === 'calling_listener'/);
  assert.match(lifecycle, /return \{ callId: input\.callId, status: row\.status, idempotent: true \}/);
  assert.match(lifecycle, /if \(row\.status !== input\.fromStatus\) throw new Error\('invalid_call_transition'\)/);
});

test('settlement locks call and wallet before mutating money', () => {
  assert.match(lifecycle, /FROM app\.call_sessions[\s\S]*?FOR UPDATE/);
  assert.match(lifecycle, /FROM app\.wallets[\s\S]*?FOR UPDATE/);
  assert.match(lifecycle, /balance_minor=balance_minor-\$2::bigint/);
  assert.match(lifecycle, /reserved_minor=reserved_minor-\$3::bigint/);
});

test('settlement is bounded by authorization and exact billing math', () => {
  assert.match(lifecycle, /previewCallSettlementBigInt/);
  assert.match(lifecycle, /Math\.min\(input\.connectedSeconds, row\.max_billable_seconds\)/);
  assert.match(lifecycle, /settlement\.billableSeconds > row\.max_billable_seconds/);
  assert.match(lifecycle, /charge > authorized/);
  assert.match(lifecycle, /earning > charge/);
});

test('duplicate settlement cannot create a second charge or earning', () => {
  assert.match(lifecycle, /row\.status === 'completed'/);
  assert.match(lifecycle, /idempotent: true/);
  assert.match(lifecycle, /`call:\$\{row\.id\}:charge`/);
  assert.match(lifecycle, /INSERT INTO app\.listener_earnings/);
  assert.match(lifecycle, /call_session_id/);
});

test('unconnected terminal callbacks release reservation without charging', () => {
  const start = lifecycle.indexOf('export async function endUnconnectedCallByProvider');
  const end = lifecycle.indexOf('export async function settleCallByProvider');
  assert.ok(start >= 0 && end > start);
  const section = lifecycle.slice(start, end);
  assert.match(section, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.doesNotMatch(section, /wallet_transactions/);
  assert.doesNotMatch(section, /listener_earnings/);
});

test('connected safety exit freezes end time and settles immediately', () => {
  assert.match(safety, /const stoppedAt = new Date\(\)/);
  assert.match(safety, /status === 'connected' && !call\.provider_bridge_id/);
  assert.match(safety, /settleCallByProvider\(\{/);
  assert.match(safety, /Math\.floor\(\(result\.stoppedAt\.getTime\(\) - connectedAtMs\) \/ 1000\)/);
  assert.match(safety, /safety_settlement_pending/);
});

test('mobile safety exit sends the backend contract, not an ignored reasonCode', () => {
  const start = mobile.indexOf('export function safetyExitCall');
  const end = mobile.indexOf('export function reportCallSafety');
  assert.ok(start >= 0 && end > start);
  const section = mobile.slice(start, end);
  assert.match(section, /details\?: string/);
  assert.match(section, /blockCounterparty\?: boolean/);
  assert.doesNotMatch(section, /reasonCode/);
});
