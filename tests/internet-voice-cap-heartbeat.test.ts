import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const heartbeat = await readFile(new URL('../services/api/src/routes/internet-voice-heartbeat.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');

test('Internet Voice heartbeat is participant-authenticated and transport scoped', () => {
  assert.match(heartbeat, /await requireAuth\(req\)/);
  assert.match(heartbeat, /row\.transport !== 'internet_voice'/);
  assert.match(heartbeat, /not_call_participant/);
});

test('Internet Voice heartbeat uses server call timestamps and hard-stops at the authorized cap', () => {
  assert.match(heartbeat, /sessionTiming\(\{/);
  assert.match(heartbeat, /connectedAt: row\.connected_at/);
  assert.match(heartbeat, /maxBillableSeconds: row\.max_billable_seconds/);
  assert.match(heartbeat, /row\.status === 'connected' && timing\.remainingSeconds === 0/);
  assert.match(heartbeat, /settleInternetVoiceCall\(\{/);
  assert.match(heartbeat, /internet_voice_session_cap_reached/);
});

test('handler exposes a POST-only Internet Voice heartbeat endpoint', () => {
  assert.match(handler, /voiceHeartbeatMatch/);
  assert.match(handler, /\/voice\\\/heartbeat/);
  assert.match(handler, /method === 'POST' && voiceHeartbeatMatch/);
  assert.match(handler, /heartbeatInternetVoiceCall/);
});