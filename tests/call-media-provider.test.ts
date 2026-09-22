import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCallMediaProvider } from '../packages/domain/src/call-media.ts';

// W60 — pure fail-closed policy resolution, same style as
// tests/recording-domain.test.ts's resolveRecordingRequirement coverage.

test('Production accepts only an explicit "realtimekit"', () => {
  assert.equal(
    resolveCallMediaProvider({ environment: 'production', explicitProvider: 'realtimekit' }),
    'realtimekit',
  );
});

test('Production rejects the legacy provider even if explicitly set', () => {
  assert.throws(
    () => resolveCallMediaProvider({ environment: 'production', explicitProvider: 'legacy_p2p' }),
    /call_media_provider_must_be_realtimekit_in_production/,
  );
});

test('Production rejects an unset provider (no implicit default)', () => {
  assert.throws(
    () => resolveCallMediaProvider({ environment: 'production', explicitProvider: null }),
    /call_media_provider_must_be_realtimekit_in_production/,
  );
});

test('Production rejects garbage input the same as unset', () => {
  assert.throws(
    () => resolveCallMediaProvider({ environment: 'production', explicitProvider: 'something_else' }),
    /call_media_provider_must_be_realtimekit_in_production/,
  );
});

for (const environment of ['preview_internal_beta', 'local'] as const) {
  test(`${environment}: explicit "realtimekit" is accepted`, () => {
    assert.equal(resolveCallMediaProvider({ environment, explicitProvider: 'realtimekit' }), 'realtimekit');
  });

  test(`${environment}: explicit "legacy_p2p" is accepted (Internal Preview technical-beta exception)`, () => {
    assert.equal(resolveCallMediaProvider({ environment, explicitProvider: 'legacy_p2p' }), 'legacy_p2p');
  });

  test(`${environment}: an unset provider fails closed (no implicit default, mirrors Production)`, () => {
    assert.throws(
      () => resolveCallMediaProvider({ environment, explicitProvider: null }),
      /call_media_provider_not_configured/,
    );
  });

  test(`${environment}: garbage input fails closed the same as unset`, () => {
    assert.throws(
      () => resolveCallMediaProvider({ environment, explicitProvider: 'webrtc' }),
      /call_media_provider_not_configured/,
    );
  });
}

test('input is normalized (trimmed, case-insensitive)', () => {
  assert.equal(
    resolveCallMediaProvider({ environment: 'local', explicitProvider: '  RealtimeKit  ' }),
    'realtimekit',
  );
});
