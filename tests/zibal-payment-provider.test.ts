import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getPaymentProvider,
  PaymentProviderError,
  validatePaymentProviderEnv,
} from '../services/api/src/providers/payment.ts';

const paymentRoutes = await readFile(new URL('../services/api/src/routes/payments.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');

const paymentEnvNames = ['NODE_ENV', 'PAYMENT_PROVIDER', 'ZIBAL_MERCHANT', 'PAYMENT_CALLBACK_BASE_URL'] as const;

function restoreEnvironment(previous: Record<string, string | undefined>): void {
  for (const name of paymentEnvNames) {
    const value = previous[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test('Zibal adapter creates and verifies a payment through mocked JSON endpoints only', { concurrency: false }, async () => {
  const previous = Object.fromEntries(paymentEnvNames.map((name) => [name, process.env[name]])) as Record<string, string | undefined>;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  process.env.NODE_ENV = 'test';
  process.env.PAYMENT_PROVIDER = 'zibal';
  process.env.ZIBAL_MERCHANT = 'zibal';
  process.env.PAYMENT_CALLBACK_BASE_URL = 'https://preview.example.test';
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url, body });
    const response = url.endsWith('/request')
      ? { result: 100, trackId: 991001 }
      : { result: 100, status: 1, orderId: 'order-1', amount: 40000, refNumber: 77001 };
    return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const provider = getPaymentProvider();
    assert.equal(provider.key, 'zibal');
    const created = await provider.createPayment({
      orderId: 'order-1',
      amountMinor: 40000n,
      currencyCode: 'IRR',
      callbackUri: 'https://preview.example.test/v1/payments/zibal/callback',
    });
    assert.deepEqual(created, {
      providerPaymentId: '991001',
      redirectUrl: 'https://gateway.zibal.ir/start/991001',
    });
    const verified = await provider.verifyPayment({ providerPaymentId: '991001', amountMinor: 40000n, currencyCode: 'IRR' });
    assert.deepEqual(verified, {
      paid: true,
      providerCode: 100,
      orderId: 'order-1',
      amountMinor: 40000n,
      providerReference: '77001',
    });
    assert.deepEqual(requests, [
      {
        url: 'https://gateway.zibal.ir/v1/request',
        body: {
          merchant: 'zibal',
          amount: 40000,
          callbackUrl: 'https://preview.example.test/v1/payments/zibal/callback',
          orderId: 'order-1',
        },
      },
      {
        url: 'https://gateway.zibal.ir/v1/verify',
        body: { merchant: 'zibal', trackId: 991001 },
      },
    ]);
    await assert.rejects(
      provider.refund('991001', 40000n, 'IRR'),
      (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_refund_not_supported',
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(previous);
  }
});

test('the public Zibal test merchant cannot be selected in production', { concurrency: false }, () => {
  const previous = Object.fromEntries(paymentEnvNames.map((name) => [name, process.env[name]])) as Record<string, string | undefined>;
  process.env.NODE_ENV = 'production';
  process.env.PAYMENT_PROVIDER = 'zibal';
  process.env.ZIBAL_MERCHANT = 'zibal';
  process.env.PAYMENT_CALLBACK_BASE_URL = 'https://api.example.test';
  try {
    assert.throws(
      () => validatePaymentProviderEnv(),
      (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_provider_not_configured',
    );
  } finally {
    restoreEnvironment(previous);
  }
});

test('Zibal callbacks remain recovery-only and public top-up creation stays gated', () => {
  assert.match(paymentRoutes, /paymentVerificationDisposition\(row\.provider, verified\.providerCode\)/);
  assert.match(paymentRoutes, /verified\.orderId !== row\.id/);
  assert.match(paymentRoutes, /verified\.amountMinor !== BigInt\(row\.amount_minor\)/);
  assert.match(paymentRoutes, /\$\{current\.provider\}_verified/);

  const zibalCallbackLine = handler.split('\n').find((line) => line.includes("'/v1/payments/zibal/callback'"));
  const topupCreateLine = handler.split('\n').find((line) => line.includes("url.pathname === '/v1/wallet/topups'"));
  assert.ok(zibalCallbackLine);
  assert.ok(topupCreateLine);
  assert.doesNotMatch(zibalCallbackLine, /requireCallerClosedBetaEnabled/);
  assert.match(topupCreateLine, /requireCallerClosedBetaEnabled\(\)/);
});
