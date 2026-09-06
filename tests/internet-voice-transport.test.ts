import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getCallTransportReadiness,
  parseIceServers,
  validatePrimaryCallTransportEnv,
} from '../services/api/src/providers/call-transport.ts';

const handlerSource = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const voiceSource = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');

const ENV_KEYS = [
  'NODE_ENV',
  'CALL_PRIMARY_TRANSPORT',
  'CALL_FALLBACK_TRANSPORT',
  'INTERNET_VOICE_ICE_SERVERS_JSON',
  'INTERNET_VOICE_IRAN_ICE_SERVERS_JSON',
  'INTERNET_VOICE_IRAN_CONTROL_PLANE_BASE_URL',
  'TELEPHONY_PROVIDER',
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => void) {
  const before = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) before.set(key, process.env[key]);
  try {
    for (const key of ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = before.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('ICE parser accepts STUN/TURN config and rejects malformed input', () => {
  const parsed = parseIceServers(JSON.stringify([
    { urls: 'stun:stun.example.test:3478' },
    { urls: ['turn:turn.example.test:3478?transport=udp', 'turns:turn.example.test:5349'], username: 'u', credential: 'c' },
  ]));
  assert.equal(parsed.length, 2);
  assert.throws(() => parseIceServers('{bad json'));
  assert.throws(() => parseIceServers(JSON.stringify([{ urls: [] }])));
  assert.throws(() => parseIceServers(JSON.stringify([{ urls: 'turn:x', username: 'u' }])));
});

test('Internet Voice is the default primary transport and PSTN remains non-blocking fallback', () => {
  withEnv({ NODE_ENV: 'development', CALL_PRIMARY_TRANSPORT: undefined, CALL_FALLBACK_TRANSPORT: undefined, TELEPHONY_PROVIDER: undefined }, () => {
    const readiness = getCallTransportReadiness();
    assert.equal(readiness.primary, 'internet_voice');
    assert.equal(readiness.fallback, 'masked_pstn');
    assert.equal(readiness.maskedPstn.configured, false);
    assert.doesNotThrow(() => validatePrimaryCallTransportEnv());
  });
});

test('production Internet Voice fails closed without a TURN relay', () => {
  withEnv({
    NODE_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    INTERNET_VOICE_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'stun:stun.example.test:3478' }]),
  }, () => {
    assert.throws(() => validatePrimaryCallTransportEnv(), /internet_voice_turn_required/);
  });

  withEnv({
    NODE_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    INTERNET_VOICE_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turn:turn.example.test:3478', username: 'u', credential: 'c' }]),
  }, () => {
    assert.doesNotThrow(() => validatePrimaryCallTransportEnv());
  });
});

test('Iran domestic survival path is separately configured and never faked', () => {
  withEnv({
    NODE_ENV: 'development',
    INTERNET_VOICE_IRAN_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turn:inside.example.ir:3478', username: 'u', credential: 'c' }]),
    INTERNET_VOICE_IRAN_CONTROL_PLANE_BASE_URL: 'https://voice.example.ir',
  }, () => {
    assert.equal(getCallTransportReadiness().internetVoice.iranDomesticPathConfigured, true);
  });
  withEnv({
    NODE_ENV: 'development',
    INTERNET_VOICE_IRAN_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turn:inside.example.ir:3478', username: 'u', credential: 'c' }]),
    INTERNET_VOICE_IRAN_CONTROL_PLANE_BASE_URL: undefined,
  }, () => {
    assert.equal(getCallTransportReadiness().internetVoice.iranDomesticPathConfigured, false);
  });
});

test('caller request uses primary call transport while legacy PSTN dispatch keeps its own gate', () => {
  assert.match(handlerSource, /\/v1\/calls\/request'[\s\S]*ensureCallReady\(\)/);
  assert.match(handlerSource, /dispatchMatch\)[\s\S]*ensureTelephonyReady\(\)[\s\S]*ensureSensitiveDataReady\(\)/);
  assert.match(handlerSource, /voiceStartMatch\)[\s\S]*ensureCallReady\(\)/);
});

test('billing connection begins only after both Internet Voice participants report media connected', () => {
  const connectedIndex = voiceSource.indexOf("kind === 'media_connected'");
  const bothRolesIndex = voiceSource.indexOf("roles.has('caller') && roles.has('listener')", connectedIndex);
  const billingIndex = voiceSource.indexOf('billing_started_at=COALESCE(billing_started_at,now())', bothRolesIndex);
  assert.ok(connectedIndex >= 0 && bothRolesIndex > connectedIndex && billingIndex > bothRolesIndex);
  assert.match(voiceSource, /reason: 'both_sides_media_connected'/);
});

test('90-second no-answer path releases hold, auto-offlines listener, and charges zero', () => {
  assert.match(voiceSource, /const NO_ANSWER_SECONDS = 90/);
  assert.match(voiceSource, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.match(voiceSource, /auto_offline_reason='instant_no_answer'/);
  assert.match(voiceSource, /status='missed'/);
  assert.match(voiceSource, /chargedMinor: 0/);
  assert.match(voiceSource, /alternativesAvailable: true/);
});
