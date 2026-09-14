import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentRecordingPolicy,
  recordingPlaybackGrantTtlSeconds,
  recordingRetentionDays,
  resolveRecordingEnvironment,
} from '../services/api/src/lib/recording-config.ts';

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { fn(); }
  finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const CLEAR = {
  APP_ENV: undefined,
  VERCEL_ENV: undefined,
  CALL_RECORDING_REQUIRED: undefined,
  CALL_RECORDING_PROVIDER: undefined,
  CALL_RECORDING_CONSENT_POLICY_VERSION: undefined,
};

test('resolveRecordingEnvironment prefers VERCEL_ENV, matching the W57 apps/web|admin _env.ts pattern', () => {
  withEnv({ ...CLEAR, VERCEL_ENV: 'production' }, () => {
    assert.equal(resolveRecordingEnvironment(), 'production');
  });
  withEnv({ ...CLEAR, VERCEL_ENV: 'preview' }, () => {
    assert.equal(resolveRecordingEnvironment(), 'preview_internal_beta');
  });
  withEnv({ ...CLEAR }, () => {
    assert.equal(resolveRecordingEnvironment(), 'local');
  });
});

test('an explicit APP_ENV overrides VERCEL_ENV and an unrecognized value throws', () => {
  withEnv({ ...CLEAR, VERCEL_ENV: 'production', APP_ENV: 'local' }, () => {
    assert.equal(resolveRecordingEnvironment(), 'local');
  });
  withEnv({ ...CLEAR, APP_ENV: 'nonsense' }, () => {
    assert.throws(() => resolveRecordingEnvironment(), /unrecognized value/);
  });
});

test('production with CALL_RECORDING_REQUIRED unset fails closed at the config layer', () => {
  withEnv({ ...CLEAR, VERCEL_ENV: 'production' }, () => {
    assert.throws(() => currentRecordingPolicy());
  });
});

test('production fully configured resolves required=true end to end through env parsing', () => {
  withEnv({
    ...CLEAR,
    VERCEL_ENV: 'production',
    CALL_RECORDING_REQUIRED: 'true',
    CALL_RECORDING_PROVIDER: 'cloudflare_realtimekit',
    CALL_RECORDING_CONSENT_POLICY_VERSION: 'rec-2026-09-14',
  }, () => {
    const policy = currentRecordingPolicy();
    assert.equal(policy.required, true);
    assert.equal(policy.provider, 'cloudflare_realtimekit');
    assert.equal(policy.policyVersion, 'rec-2026-09-14');
  });
});

test('preview_internal_beta with CALL_RECORDING_REQUIRED=false is the explicit technical-beta exception', () => {
  withEnv({ ...CLEAR, VERCEL_ENV: 'preview', CALL_RECORDING_REQUIRED: 'false' }, () => {
    const policy = currentRecordingPolicy();
    assert.equal(policy.required, false);
  });
});

test('a non-boolean CALL_RECORDING_REQUIRED value is rejected rather than coerced', () => {
  withEnv({ ...CLEAR, VERCEL_ENV: 'preview', CALL_RECORDING_REQUIRED: 'yes' }, () => {
    assert.throws(() => currentRecordingPolicy(), /must be true or false/);
  });
});

test('recordingRetentionDays and playback grant TTL have sane, bounded defaults', () => {
  withEnv({ CALL_RECORDING_RETENTION_DAYS: undefined, CALL_RECORDING_PLAYBACK_TTL_SECONDS: undefined }, () => {
    assert.equal(recordingRetentionDays(), 90);
    assert.equal(recordingPlaybackGrantTtlSeconds(), 300);
  });
  withEnv({ CALL_RECORDING_RETENTION_DAYS: '0' }, () => {
    assert.throws(() => recordingRetentionDays());
  });
  withEnv({ CALL_RECORDING_PLAYBACK_TTL_SECONDS: '10' }, () => {
    assert.throws(() => recordingPlaybackGrantTtlSeconds());
  });
});
