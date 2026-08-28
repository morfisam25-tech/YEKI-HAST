import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const adminBackend = await readFile(new URL('../apps/admin/app/api/_backend.ts', import.meta.url), 'utf8');
const webBackend = await readFile(new URL('../apps/web/app/api/_backend.ts', import.meta.url), 'utf8');
const paymentProvider = await readFile(new URL('../services/api/src/providers/payment.ts', import.meta.url), 'utf8');

test('web and admin Vercel projects require explicit production API origins', () => {
  assert.match(env, /^WEB_API_BASE_URL=$/m);
  assert.match(env, /^ADMIN_API_BASE_URL=$/m);
  assert.match(webBackend, /WEB_API_BASE_URL/);
  assert.match(adminBackend, /ADMIN_API_BASE_URL/);
  assert.match(webBackend, /WEB_API_BASE_URL is required in production/);
  assert.match(adminBackend, /ADMIN_API_BASE_URL is required in production/);
  assert.doesNotMatch(webBackend, /yeki-hast\.vercel\.app/);
  assert.doesNotMatch(adminBackend, /yeki-hast\.vercel\.app/);
});

test('NextPay readiness requires an explicit HTTPS callback origin in production', () => {
  assert.match(env, /^PAYMENT_CALLBACK_BASE_URL=$/m);
  assert.match(paymentProvider, /PAYMENT_CALLBACK_BASE_URL/);
  assert.match(paymentProvider, /if \(process\.env\.NODE_ENV === 'production'\) throw new PaymentProviderError\('payment_provider_not_configured'\)/);
  assert.match(paymentProvider, /process\.env\.NODE_ENV === 'production' && url\.protocol !== 'https:'/);
  assert.match(paymentProvider, /validateCallbackBaseUrl\(\)/);
});
