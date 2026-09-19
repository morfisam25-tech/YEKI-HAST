import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetPlaybackResolverCacheForTests,
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

test('the Cloudflare RealtimeKit playback resolver fails closed: no live archival-storage facts exist yet', async () => {
  __resetPlaybackResolverCacheForTests();
  const resolver = await getPlaybackResolver('cloudflare_realtimekit');
  assert.equal(resolver.name, 'cloudflare_realtimekit');

  const result = await resolver.resolvePlayback({
    recordingSessionId: '11111111-1111-1111-1111-111111111111',
    provider: 'cloudflare_realtimekit',
    providerMeetingId: 'meeting_1',
    providerRecordingId: 'rec_1',
    ttlSeconds: 300,
  });

  assert.equal(result.status, 'unavailable');
  if (result.status === 'unavailable') {
    assert.equal(result.reason, 'archival_storage_not_provisioned');
  }
  // Never a URL, token, or provider secret in a fail-closed result.
  assert.equal('playbackUrl' in result, false);
});

test('the resolver is cached per provider name, matching the RecordingProvider cache pattern', async () => {
  __resetPlaybackResolverCacheForTests();
  const first = await getPlaybackResolver('cloudflare_realtimekit');
  const second = await getPlaybackResolver('cloudflare_realtimekit');
  assert.equal(first, second);
});
