import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { computeCallAuthorization } from '../services/api/src/domain/call-authorization.ts';
import {
  INTERNET_VOICE_EXTENSION_SECONDS,
  WAVE1_SESSION_CAP_SECONDS,
  authorizationMinorForSeconds,
  requireInternetVoiceExtensionSeconds,
  requireWave1SessionCapSeconds,
  sessionTiming,
} from '../services/api/src/domain/session-policy.ts';

const callsSource = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const extensionSource = await readFile(new URL('../services/api/src/routes/internet-voice-extension.ts', import.meta.url), 'utf8');
const handlerSource = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../packages/db/migrations/0003_internet_voice_transport.sql', import.meta.url), 'utf8');
const settlementSource = await readFile(new URL('../services/api/src/services/internet-voice-lifecycle.ts', import.meta.url), 'utf8');

test('Wave 1 exposes exactly 10/30/60 minute initial caps', () => {
  assert.deepEqual([...WAVE1_SESSION_CAP_SECONDS], [600, 1800, 3600]);
  assert.equal(requireWave1SessionCapSeconds(600), 600);
  assert.equal(requireWave1SessionCapSeconds(1800), 1800);
  assert.equal(requireWave1SessionCapSeconds(3600), 3600);
  assert.throws(() => requireWave1SessionCapSeconds(1080), /invalid_wave1_session_cap/);
});

test('call request enforces presets at the API boundary and keeps a 10-minute compatibility default', () => {
  assert.match(callsSource, /requireWave1SessionCapSeconds/);
  assert.match(callsSource, /\? 600 : Number\(value\)/);
  assert.match(callsSource, /invalid_session_cap/);
  assert.doesNotMatch(callsSource, /parsed > 86_400/);
});

test('Internet Voice extension exposes only +15 and +30 minutes', () => {
  assert.deepEqual([...INTERNET_VOICE_EXTENSION_SECONDS], [900, 1800]);
  assert.equal(requireInternetVoiceExtensionSeconds(900), 900);
  assert.equal(requireInternetVoiceExtensionSeconds(1800), 1800);
  assert.throws(() => requireInternetVoiceExtensionSeconds(600), /invalid_internet_voice_extension/);
});

test('selected session cap requires a full HOLD instead of silently shortening', () => {
  const rate = 40_000n;
  const fullTenMinuteHold = authorizationMinorForSeconds(rate, 600);
  assert.equal(fullTenMinuteHold, 400_000n);

  const enough = computeCallAuthorization({
    balanceMinor: 400_000n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: rate,
    billingIncrementSeconds: 1,
    requestedMaxSeconds: 600,
  });
  assert.deepEqual(enough, { authorizedMinor: 400_000n, maxBillableSeconds: 600 });

  const short = computeCallAuthorization({
    balanceMinor: 399_999n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: rate,
    billingIncrementSeconds: 1,
    requestedMaxSeconds: 600,
  });
  assert.equal(short, null);
});

test('server timing emits the locked 2-minute and 1-minute warnings', () => {
  const connectedAt = '2026-09-06T12:00:00.000Z';
  const nearTwo = sessionTiming({
    status: 'connected',
    connectedAt,
    maxBillableSeconds: 600,
    nowMs: Date.parse('2026-09-06T12:08:01.000Z'),
  });
  assert.equal(nearTwo.remainingSeconds, 119);
  assert.equal(nearTwo.warning, 120);

  const nearOne = sessionTiming({
    status: 'connected',
    connectedAt,
    maxBillableSeconds: 600,
    nowMs: Date.parse('2026-09-06T12:09:01.000Z'),
  });
  assert.equal(nearOne.remainingSeconds, 59);
  assert.equal(nearOne.warning, 60);
});

test('extension endpoint is idempotent, reserves incremental funds, and never disconnects the call', () => {
  assert.match(handlerSource, /\/voice\\\/extend/);
  assert.match(extensionSource, /clientRequestId/);
  assert.match(extensionSource, /wallet_hold_events/);
  assert.match(extensionSource, /reserved_minor=reserved_minor\+\$2::bigint/);
  assert.match(extensionSource, /max_billable_seconds=\$3/);
  assert.match(extensionSource, /status='connected'/);
  assert.doesNotMatch(extensionSource, /terminateCall|ended_at=|status='completed'/);
});

test('migration records initial HOLDs and rejects arbitrary Wave 1 initial durations', () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS app\.wallet_hold_events/);
  assert.match(migrationSource, /call_sessions_initial_hold_ledger/);
  assert.match(migrationSource, /'reserve'/);
  assert.match(migrationSource, /NOT IN \(600, 1800, 3600\)/);
});

test('Internet Voice no-answer records the zero-charge HOLD release in the append-only ledger', () => {
  assert.match(migrationSource, /record_internet_voice_no_answer_hold_release/);
  assert.match(migrationSource, /NEW\.ended_reason IS DISTINCT FROM 'internet_voice_no_answer'/);
  assert.match(migrationSource, /'call:' \|\| NEW\.id::text \|\| ':hold:no_answer_release'/);
  assert.match(migrationSource, /'release',[\s\S]*'internet_voice_no_answer'/);
});

test('connected settlement consumes actual charge and releases unused HOLD', () => {
  assert.match(settlementSource, /event_type,[\s\S]*'consume'/);
  assert.match(settlementSource, /const unusedHold = authorized - charge/);
  assert.match(settlementSource, /'release'/);
  assert.match(settlementSource, /actual_connected_time_charge/);
});
