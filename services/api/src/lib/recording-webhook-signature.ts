import { createVerify } from 'node:crypto';

// W81A — RealtimeKit webhook signature verification. Verified 2026-09-19
// against the live current docs: developers.cloudflare.com/realtime/
// realtimekit/webhooks/ ("Webhook headers", "Verify webhook signatures").
//
// RealtimeKit signs every webhook request body with RSA-SHA256
// (RSASSA-PKCS1-v1_5), base64-encoded in the `rtk-signature` header. The
// public key is fetched from a fixed, unauthenticated, well-known endpoint
// (not per-account) and must be verified against the *raw* request body --
// never a re-serialized/re-parsed copy, since that can change the signed
// bytes on any whitespace or key-order difference (this is explicit in
// Cloudflare's own docs).

const DEFAULT_PUBLIC_KEY_URL = 'https://api.realtime.cloudflare.com/.well-known/webhooks.json';
const PUBLIC_KEY_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

function publicKeyUrl(): string {
  return process.env.REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL?.trim() || DEFAULT_PUBLIC_KEY_URL;
}

let cachedPem: string | undefined;
let cachedAt = 0;
let cachedForUrl: string | undefined;

async function fetchPublicKeyPem(): Promise<string> {
  const url = publicKeyUrl();
  const now = Date.now();
  if (cachedPem && cachedForUrl === url && now - cachedAt < PUBLIC_KEY_CACHE_TTL_MS) return cachedPem;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new Error('realtimekit_webhook_public_key_unreachable');
  }
  if (!response.ok) throw new Error('realtimekit_webhook_public_key_unavailable');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('realtimekit_webhook_public_key_invalid_response');
  }
  const pem = (payload as { data?: { publicKey?: unknown } } | null)?.data?.publicKey;
  if (typeof pem !== 'string' || !pem.includes('BEGIN PUBLIC KEY')) {
    throw new Error('realtimekit_webhook_public_key_malformed');
  }

  cachedPem = pem;
  cachedAt = now;
  cachedForUrl = url;
  return pem;
}

// Test-only: mirrors the other provider caches' reset pattern.
export function __resetRealtimeKitWebhookPublicKeyCacheForTests(): void {
  cachedPem = undefined;
  cachedAt = 0;
  cachedForUrl = undefined;
}

// Fails closed: any fetch/parse/verification problem returns false rather
// than throwing past the caller into an unhandled 500 that could look like a
// transient (retry-worthy) failure. The caller (routes/recording-webhook.ts)
// still distinguishes "could not verify" from "verified but invalid" only in
// its own audit metadata, never in a way that helps an attacker probe why.
export async function verifyRealtimeKitWebhookSignature(rawBody: Buffer, signatureBase64: string | undefined): Promise<boolean> {
  if (!signatureBase64) return false;
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64, 'base64');
  } catch {
    return false;
  }
  if (!signature.length) return false;

  let pem: string;
  try {
    pem = await fetchPublicKeyPem();
  } catch {
    return false;
  }

  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(pem, signature);
  } catch {
    return false;
  }
}
