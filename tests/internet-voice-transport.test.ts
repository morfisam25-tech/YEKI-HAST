import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getCallTransportReadiness,
  getInternetVoiceClientConfig,
  parseIceServers,
  validatePrimaryCallTransportEnv,
} from '../services/api/src/providers/call-transport.ts';

const handlerSource = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const voiceSource = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');

const ENV_KEYS = [
  'NODE_ENV',
  'VERCEL_ENV',
  'APP_ENV',
  'CALL_PRIMARY_TRANSPORT',
  'CALL_FALLBACK_TRANSPORT',
  'CALL_MEDIA_PROVIDER',
  'CLOUDFLARE_TURN_KEY_ID',
  'CLOUDFLARE_TURN_API_TOKEN',
  'CLOUDFLARE_TURN_TTL_SECONDS',
  'CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID',
  'CLOUDFLARE_REALTIMEKIT_APP_ID',
  'CLOUDFLARE_REALTIMEKIT_API_TOKEN',
  'CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME',
  'CALL_RECORDING_REQUIRED',
  'CALL_RECORDING_PROVIDER',
  'CALL_RECORDING_CONSENT_POLICY_VERSION',
  'INTERNET_VOICE_ICE_SERVERS_JSON',
  'INTERNET_VOICE_IRAN_ICE_SERVERS_JSON',
  'INTERNET_VOICE_IRAN_CONTROL_PLANE_BASE_URL',
  'TELEPHONY_PROVIDER',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];
type EnvValues = Partial<Record<EnvKey, string | undefined>>;

function captureEnv() {
  const before = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) before.set(key, process.env[key]);
  return before;
}

function applyEnv(values: EnvValues) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function restoreEnv(before: Map<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = before.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withEnv(values: EnvValues, fn: () => void) {
  const before = captureEnv();
  try {
    applyEnv(values);
    fn();
  } finally {
    restoreEnv(before);
  }
}

async function withEnvAsync(values: EnvValues, fn: () => Promise<void>) {
  const before = captureEnv();
  try {
    applyEnv(values);
    await fn();
  } finally {
    restoreEnv(before);
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

test('Internet Voice is the default primary transport and PSTN fallback is off unless explicitly enabled', () => {
  withEnv({ NODE_ENV: 'development', CALL_PRIMARY_TRANSPORT: undefined, CALL_FALLBACK_TRANSPORT: undefined, TELEPHONY_PROVIDER: undefined }, () => {
    const readiness = getCallTransportReadiness();
    assert.equal(readiness.primary, 'internet_voice');
    assert.equal(readiness.fallback, null);
    assert.equal(readiness.maskedPstn.configured, false);
    assert.equal(readiness.internetVoice.credentialMode, 'none');
    assert.doesNotThrow(() => validatePrimaryCallTransportEnv());
  });

  withEnv({ NODE_ENV: 'development', CALL_PRIMARY_TRANSPORT: 'internet_voice', CALL_FALLBACK_TRANSPORT: 'masked_pstn', TELEPHONY_PROVIDER: undefined }, () => {
    const readiness = getCallTransportReadiness();
    assert.equal(readiness.primary, 'internet_voice');
    assert.equal(readiness.fallback, 'masked_pstn');
    assert.equal(readiness.maskedPstn.configured, false);
  });
});

test('production Internet Voice fails closed without a TURN relay', () => {
  withEnv({
    NODE_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'legacy_p2p',
    INTERNET_VOICE_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'stun:stun.example.test:3478' }]),
  }, () => {
    assert.throws(() => validatePrimaryCallTransportEnv(), /internet_voice_turn_required/);
  });

  withEnv({
    NODE_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'legacy_p2p',
    INTERNET_VOICE_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turn:turn.example.test:3478', username: 'u', credential: 'c' }]),
  }, () => {
    assert.equal(getCallTransportReadiness().internetVoice.credentialMode, 'static');
    assert.doesNotThrow(() => validatePrimaryCallTransportEnv());
  });
});

test('Cloudflare TURN configuration fails closed when the long-lived server secret pair is incomplete', () => {
  withEnv({
    NODE_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'legacy_p2p',
    CLOUDFLARE_TURN_KEY_ID: 'turnkey12345678',
    CLOUDFLARE_TURN_API_TOKEN: undefined,
  }, () => {
    assert.throws(() => getCallTransportReadiness(), /invalid_cloudflare_turn_config/);
    assert.throws(() => validatePrimaryCallTransportEnv(), /invalid_cloudflare_turn_config/);
  });
});

test('production Internet Voice with the legacy provider never accepts RealtimeKit config as a substitute for TURN', () => {
  withEnv({
    NODE_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'legacy_p2p',
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'token',
    CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME: 'voice-preset',
  }, () => {
    assert.throws(() => validatePrimaryCallTransportEnv(), /internet_voice_not_configured/);
  });
});

test('RealtimeKit is the production media path and is never held to the legacy TURN/static-ICE contract', () => {
  withEnv({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'realtimekit',
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'token',
    CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME: 'voice-preset',
    CALL_RECORDING_REQUIRED: 'true',
    CALL_RECORDING_PROVIDER: 'cloudflare_realtimekit',
    CALL_RECORDING_CONSENT_POLICY_VERSION: 'rec-2026-09-14',
  }, () => {
    // No TURN/static ICE env at all -- must still pass, because RealtimeKit
    // owns signaling/media relay on this path.
    assert.doesNotThrow(() => validatePrimaryCallTransportEnv());
  });
});

test('RealtimeKit in production still fails closed when RealtimeKit itself is unconfigured', () => {
  withEnv({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'realtimekit',
  }, () => {
    assert.throws(() => validatePrimaryCallTransportEnv(), /cloudflare_realtimekit_not_configured/);
  });

  withEnv({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'realtimekit',
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'token',
    CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME: undefined,
  }, () => {
    assert.throws(() => validatePrimaryCallTransportEnv(), /CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME not configured/);
  });
});

test('RealtimeKit in production still fails closed when recording is not fully configured', () => {
  withEnv({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'realtimekit',
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'token',
    CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME: 'voice-preset',
    CALL_RECORDING_REQUIRED: undefined,
  }, () => {
    assert.throws(() => validatePrimaryCallTransportEnv(), /recording_required_must_be_explicitly_true_in_production/);
  });
});

test('RealtimeKit in Preview may keep the explicit recording-disabled technical-beta exception', () => {
  withEnv({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CALL_MEDIA_PROVIDER: 'realtimekit',
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'token',
    CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME: 'voice-preset',
    CALL_RECORDING_REQUIRED: 'false',
  }, () => {
    assert.doesNotThrow(() => validatePrimaryCallTransportEnv());
  });
});

test('Cloudflare TURN generates short-lived relay credentials server-side without exposing the key or API token', async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = '';
  let observedAuthorization = '';
  let observedBody = '';
  globalThis.fetch = async (input, init) => {
    observedUrl = String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    observedAuthorization = headers?.authorization ?? '';
    observedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        {
          urls: [
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turns:turn.cloudflare.com:443?transport=tcp',
          ],
          username: 'temporary-user',
          credential: 'temporary-credential',
        },
      ],
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  };

  try {
    await withEnvAsync({
      NODE_ENV: 'production',
      CALL_PRIMARY_TRANSPORT: 'internet_voice',
      CALL_MEDIA_PROVIDER: 'legacy_p2p',
      CLOUDFLARE_TURN_KEY_ID: 'turnkey12345678',
      CLOUDFLARE_TURN_API_TOKEN: 'server-only-api-token',
      CLOUDFLARE_TURN_TTL_SECONDS: '14400',
      INTERNET_VOICE_ICE_SERVERS_JSON: undefined,
    }, async () => {
      const readiness = getCallTransportReadiness();
      assert.equal(readiness.internetVoice.configured, true);
      assert.equal(readiness.internetVoice.relayConfigured, true);
      assert.equal(readiness.internetVoice.credentialMode, 'cloudflare_short_lived');
      assert.doesNotThrow(() => validatePrimaryCallTransportEnv());

      const client = await getInternetVoiceClientConfig();
      assert.equal(client.relayConfigured, true);
      assert.equal(client.iranDomesticPath, false);
      assert.equal(client.iceServers[1]?.username, 'temporary-user');
      assert.equal(client.iceServers[1]?.credential, 'temporary-credential');
      assert.equal(observedUrl, 'https://rtc.live.cloudflare.com/v1/turn/keys/turnkey12345678/credentials/generate-ice-servers');
      assert.equal(observedAuthorization, 'Bearer server-only-api-token');
      assert.equal(observedBody, JSON.stringify({ ttl: 14400 }));
      const serializedClient = JSON.stringify(client);
      assert.doesNotMatch(serializedClient, /server-only-api-token/);
      assert.doesNotMatch(serializedClient, /turnkey12345678/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare TURN rejects invalid TTLs and upstream responses without leaking provider details', async () => {
  await withEnvAsync({
    NODE_ENV: 'production',
    CALL_PRIMARY_TRANSPORT: 'internet_voice',
    CLOUDFLARE_TURN_KEY_ID: 'turnkey12345678',
    CLOUDFLARE_TURN_API_TOKEN: 'server-only-api-token',
    CLOUDFLARE_TURN_TTL_SECONDS: '172801',
  }, async () => {
    assert.throws(() => getCallTransportReadiness(), /invalid_cloudflare_turn_ttl/);
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('provider says secret thing', { status: 503 });
  try {
    await withEnvAsync({
      NODE_ENV: 'production',
      CALL_PRIMARY_TRANSPORT: 'internet_voice',
      CLOUDFLARE_TURN_KEY_ID: 'turnkey12345678',
      CLOUDFLARE_TURN_API_TOKEN: 'server-only-api-token',
      CLOUDFLARE_TURN_TTL_SECONDS: '14400',
    }, async () => {
      await assert.rejects(() => getInternetVoiceClientConfig(), /^Error: cloudflare_turn_credentials_unavailable$/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('voice routes await short-lived TURN credentials and fail closed before returning client configuration', () => {
  assert.match(voiceSource, /await getInternetVoiceClientConfig\(\)/);
  assert.match(voiceSource, /internet_voice_turn_credentials_unavailable/);
  // W60: TURN/ICE resolution is now scoped to the legacy_p2p media provider
  // only -- RealtimeKit handles its own relay and never calls
  // getVoiceClientConfigOr503() at all (task section 9/18). The ordering
  // invariant this test protects (resolve external transport config before
  // mutating call state) still holds for whichever branch actually runs.
  const credentialsIndex = voiceSource.indexOf(
    "const voiceClient = mediaProvider === 'legacy_p2p' ? await getVoiceClientConfigOr503() : null;",
    voiceSource.indexOf('startInternetVoiceCall'),
  );
  const transactionIndex = voiceSource.indexOf('const result = await withTransaction', voiceSource.indexOf('startInternetVoiceCall'));
  assert.ok(credentialsIndex >= 0 && transactionIndex > credentialsIndex);
});

test('billing connection begins only after both Internet Voice participants report media connected', () => {
  const connectedIndex = voiceSource.indexOf("kind === 'media_connected'");
  const bothRolesIndex = voiceSource.indexOf("roles.has('caller') && roles.has('listener')", connectedIndex);
  const billingIndex = voiceSource.indexOf('billing_started_at=CASE WHEN $2::boolean THEN COALESCE(billing_started_at,now())', bothRolesIndex);
  assert.ok(connectedIndex >= 0 && bothRolesIndex > connectedIndex && billingIndex > bothRolesIndex);
  assert.match(voiceSource, /reason: 'both_sides_media_connected'/);
});

// W58: for a recording-required call, both-sides-media-connected alone is no longer
// sufficient -- billing_started_at additionally requires a fresh, authoritative
// confirmRecordingActiveForBilling() result inside the same transaction.
test('recording-required billing additionally requires a confirmed active recording state', () => {
  const bothRolesIndex = voiceSource.indexOf("roles.has('caller') && roles.has('listener')");
  const gateIndex = voiceSource.indexOf('confirmRecordingActiveForBilling(client, rawCallId)', bothRolesIndex);
  const billingIndex = voiceSource.indexOf('billing_started_at=CASE WHEN $2::boolean', gateIndex);
  assert.ok(bothRolesIndex >= 0 && gateIndex > bothRolesIndex && billingIndex > gateIndex);
  assert.match(voiceSource, /recordingGate\.active/);
});

test('90-second no-answer path releases hold, auto-offlines listener, and charges zero', () => {
  assert.match(voiceSource, /const NO_ANSWER_SECONDS = 90/);
  assert.match(voiceSource, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.match(voiceSource, /auto_offline_reason='instant_no_answer'/);
  assert.match(voiceSource, /status='missed'/);
  assert.match(voiceSource, /chargedMinor: 0/);
  assert.match(voiceSource, /alternativesAvailable: true/);
});
