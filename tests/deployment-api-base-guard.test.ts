import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const adminBackend = await readFile(new URL('../apps/admin/app/api/_backend.ts', import.meta.url), 'utf8');
const webBackend = await readFile(new URL('../apps/web/app/api/_backend.ts', import.meta.url), 'utf8');
const paymentProvider = await readFile(new URL('../services/api/src/providers/payment.ts', import.meta.url), 'utf8');
const canonicalApiOrigin = 'https://yeki-hast-unique-6ff0.vercel.app';
const staleApiOrigin = 'https://yeki-hast-theta.vercel.app';

test('web and admin Vercel projects keep override support and the canonical production API origin', () => {
  assert.match(env, /^WEB_API_BASE_URL=$/m);
  assert.match(env, /^ADMIN_API_BASE_URL=$/m);
  assert.match(webBackend, /WEB_API_BASE_URL/);
  assert.match(adminBackend, /ADMIN_API_BASE_URL/);
  assert.match(webBackend, new RegExp(canonicalApiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(adminBackend, new RegExp(canonicalApiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(webBackend, new RegExp(staleApiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(adminBackend, new RegExp(staleApiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('NextPay readiness requires an explicit HTTPS callback origin in production', () => {
  assert.match(env, /^PAYMENT_CALLBACK_BASE_URL=$/m);
  assert.match(paymentProvider, /PAYMENT_CALLBACK_BASE_URL/);
  assert.match(paymentProvider, /if \(process\.env\.NODE_ENV === 'production'\) throw new PaymentProviderError\('payment_provider_not_configured'\)/);
  assert.match(paymentProvider, /process\.env\.NODE_ENV === 'production' && url\.protocol !== 'https:'/);
  assert.match(paymentProvider, /validateCallbackBaseUrl\(\)/);
});
