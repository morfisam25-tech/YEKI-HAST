import assert from 'node:assert/strict';
import test from 'node:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import {
  __resetRealtimeKitWebhookPublicKeyCacheForTests,
  verifyRealtimeKitWebhookSignature,
} from '../services/api/src/lib/recording-webhook-signature.ts';

// W81A — unit-level (no DB) coverage for RSA-SHA256 webhook signature
// verification, using a real generated keypair rather than a stub. Verified
// 2026-09-19 against developers.cloudflare.com/realtime/realtimekit/
// webhooks/ ("Verify webhook signatures"): RSA-SHA256 (RSASSA-PKCS1-v1_5)
// over the raw body, base64-encoded, public key served from a fixed
// well-known JSON endpoint as { success, data: { publicKey } }.

function withFetch(handler: typeof fetch, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => { globalThis.fetch = original; });
}

test('a correctly signed body verifies against the fetched public key', async () => {
  __resetRealtimeKitWebhookPublicKeyCacheForTests();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const body = Buffer.from(JSON.stringify({ event: 'recording.statusUpdate' }));
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64');

  await withFetch(
    (async () => new Response(JSON.stringify({ success: true, data: { publicKey: pem }, message: '' }), { status: 200 })) as typeof fetch,
    async () => {
      const verified = await verifyRealtimeKitWebhookSignature(body, signature);
      assert.equal(verified, true);
    },
  );
});

test('a signature produced by a different keypair is rejected', async () => {
  __resetRealtimeKitWebhookPublicKeyCacheForTests();
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { privateKey: otherPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const body = Buffer.from(JSON.stringify({ event: 'recording.statusUpdate' }));
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  signer.end();
  const signature = signer.sign(otherPrivateKey).toString('base64');

  await withFetch(
    (async () => new Response(JSON.stringify({ success: true, data: { publicKey: pem }, message: '' }), { status: 200 })) as typeof fetch,
    async () => {
      const verified = await verifyRealtimeKitWebhookSignature(body, signature);
      assert.equal(verified, false);
    },
  );
});

test('a missing signature header fails closed without even fetching the public key', async () => {
  __resetRealtimeKitWebhookPublicKeyCacheForTests();
  let fetchCalled = false;
  await withFetch(
    (async () => { fetchCalled = true; throw new Error('should not be called'); }) as typeof fetch,
    async () => {
      const verified = await verifyRealtimeKitWebhookSignature(Buffer.from('{}'), undefined);
      assert.equal(verified, false);
    },
  );
  assert.equal(fetchCalled, false);
});

test('a malformed public-key response fails closed rather than throwing past the caller', async () => {
  __resetRealtimeKitWebhookPublicKeyCacheForTests();
  await withFetch(
    (async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })) as typeof fetch,
    async () => {
      const verified = await verifyRealtimeKitWebhookSignature(Buffer.from('{}'), 'anything');
      assert.equal(verified, false);
    },
  );
});

test('an unreachable public-key endpoint fails closed rather than throwing', async () => {
  __resetRealtimeKitWebhookPublicKeyCacheForTests();
  await withFetch(
    (async () => { throw new Error('network down'); }) as typeof fetch,
    async () => {
      const verified = await verifyRealtimeKitWebhookSignature(Buffer.from('{}'), 'anything');
      assert.equal(verified, false);
    },
  );
});

test('the public key is cached: a second verification within the TTL does not re-fetch', async () => {
  __resetRealtimeKitWebhookPublicKeyCacheForTests();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  let fetchCount = 0;
  const body = Buffer.from('{}');
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64');

  await withFetch(
    (async () => { fetchCount += 1; return new Response(JSON.stringify({ success: true, data: { publicKey: pem }, message: '' }), { status: 200 }); }) as typeof fetch,
    async () => {
      await verifyRealtimeKitWebhookSignature(body, signature);
      await verifyRealtimeKitWebhookSignature(body, signature);
    },
  );
  assert.equal(fetchCount, 1, 'the public key must be cached, not re-fetched on every verification');
});
