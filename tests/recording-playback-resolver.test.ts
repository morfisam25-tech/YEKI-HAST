import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetPlaybackResolverCacheForTests,
  capPlaybackTtlSeconds,
  getPlaybackResolver,
  PlaybackResolverError,
} from '../services/api/src/providers/recording-playback-resolver.ts';

test('an unsupported playback resolver provider fails closed with a typed error, not a guessed URL', async () => {
  __resetPlaybackResolverCacheForTests();
  await assert.rejects(() => getPlaybackResolver('some_unverified_provider'), (error) => {
    assert.ok(error instanceof PlaybackResolverError);
    assert.equal(error.code, 'playback_resolver_not_supported');
    return true;
  });
});

test('the Cloudflare RealtimeKit playback resolver fails closed when private archive is not configured', async () => {
  __resetPlaybackResolverCacheForTests();
  const resolver = await getPlaybackResolver('cloudflare_realtimekit');
  assert.equal(resolver.name, 'cloudflare_realtimekit');

  const result = await resolver.resolvePlayback({
    recordingSessionId: '11111111-1111-1111-1111-111111111111',
    provider: 'cloudflare_realtimekit',
    providerMeetingId: 'meeting_1',
    providerRecordingId: 'rec_1',
    ttlSeconds: 300,
    grantExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  });

  assert.equal(result.status, 'unavailable');
  if (result.status === 'unavailable') {
    assert.equal(result.reason, 'recording_archive_not_configured');
  }
  assert.equal('playbackUrl' in result, false);
});

test('an already-expired playback grant fails before any archive/provider access', async () => {
  __resetPlaybackResolverCacheForTests();
  const resolver = await getPlaybackResolver('cloudflare_realtimekit');
  const result = await resolver.resolvePlayback({
    recordingSessionId: '11111111-1111-1111-1111-111111111111',
    provider: 'cloudflare_realtimekit',
    providerMeetingId: 'meeting_1',
    providerRecordingId: 'rec_1',
    ttlSeconds: 300,
    grantExpiresAt: new Date(Date.now() - 1_000).toISOString(),
  });
  assert.deepEqual(result, { status: 'unavailable', reason: 'playback_grant_expired' });
});

test('TTL cap never exceeds either configured value or remaining grant lifetime', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  assert.equal(capPlaybackTtlSeconds({
    configuredTtlSeconds: 300,
    grantExpiresAt: '2026-09-19T12:00:45Z',
    now,
  }), 45);
});

test('the resolver is cached per provider name, matching the RecordingProvider cache pattern', async () => {
  __resetPlaybackResolverCacheForTests();
  const first = await getPlaybackResolver('cloudflare_realtimekit');
  const second = await getPlaybackResolver('cloudflare_realtimekit');
  assert.equal(first, second);
});
