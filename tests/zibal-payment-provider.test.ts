import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getPaymentProvider,
  isProviderPaymentId,
  PaymentProviderError,
  paymentRedirectUrl,
  validatePaymentProviderEnv,
} from '../services/api/src/providers/payment.ts';
import { paymentVerificationDisposition, zibalVerificationDisposition } from '../services/api/src/domain/payment-status.ts';

const paymentRoutes = await readFile(new URL('../services/api/src/routes/payments.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const providerSource = await readFile(new URL('../services/api/src/providers/payment.ts', import.meta.url), 'utf8');

const paymentEnvNames = ['NODE_ENV', 'PAYMENT_PROVIDER', 'ZIBAL_MERCHANT', 'NEXTPAY_API_KEY', 'PAYMENT_CALLBACK_BASE_URL'] as const;

function withPaymentEnv<T>(vars: Partial<Record<(typeof paymentEnvNames)[number], string>>, fn: () => T): T {
  const previous = Object.fromEntries(paymentEnvNames.map((name) => [name, process.env[name]])) as Record<string, string | undefined>;
  for (const name of paymentEnvNames) {
    if (name in vars) process.env[name] = vars[name];
    else delete process.env[name];
  }
  try { return fn(); }
  finally {
    for (const name of paymentEnvNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('Zibal adapter creates and verifies a payment through mocked JSON endpoints only', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  await withPaymentEnv({
    NODE_ENV: 'test',
    PAYMENT_PROVIDER: 'zibal',
    ZIBAL_MERCHANT: 'zibal',
    PAYMENT_CALLBACK_BASE_URL: 'https://preview.example.test',
  }, async () => {
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
    }
  });
});

test('Zibal result=100 without a successful status is treated as pending, not paid (no ×10/÷10 unit games either)', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  await withPaymentEnv({
    NODE_ENV: 'test',
    PAYMENT_PROVIDER: 'zibal',
    ZIBAL_MERCHANT: 'zibal',
    PAYMENT_CALLBACK_BASE_URL: 'https://preview.example.test',
  }, async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ result: 100, status: 2, orderId: 'order-1', amount: 40000 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
    try {
      const provider = getPaymentProvider();
      const verified = await provider.verifyPayment({ providerPaymentId: '991001', amountMinor: 40000n, currencyCode: 'IRR' });
      assert.equal(verified.paid, false);
      assert.equal(verified.providerCode, -1);
      assert.equal(paymentVerificationDisposition('zibal', verified.providerCode), 'pending');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Zibal amounts are Rial minor units end to end -- request/verify never scale by 10', () => {
  // The adapter forwards amountMinor untouched (Number(input.amountMinor) on
  // request, and reads verify's `amount` field raw via optionalBigInt) --
  // this is the concrete guard against a x10/÷10 Toman/Rial mixup mistake.
  assert.match(providerSource, /amount: Number\(input\.amountMinor\)/);
  assert.doesNotMatch(providerSource, /amountMinor\s*\*\s*10|amountMinor\s*\/\s*10/);
});

test('the public Zibal test merchant cannot be selected in production', { concurrency: false }, () => {
  withPaymentEnv({
    NODE_ENV: 'production',
    PAYMENT_PROVIDER: 'zibal',
    ZIBAL_MERCHANT: 'zibal',
    PAYMENT_CALLBACK_BASE_URL: 'https://api.example.test',
  }, () => {
    assert.throws(
      () => validatePaymentProviderEnv(),
      (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_provider_not_configured',
    );
  });
});

test('missing ZIBAL_MERCHANT fails closed rather than defaulting to any merchant', () => {
  withPaymentEnv({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'zibal' }, () => {
    assert.throws(
      () => validatePaymentProviderEnv(),
      (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_provider_not_configured',
    );
  });
});

test('an unrecognized PAYMENT_PROVIDER value fails closed, never silently defaults to a provider', () => {
  withPaymentEnv({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'stripe' }, () => {
    assert.throws(
      () => validatePaymentProviderEnv(),
      (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_provider_not_configured',
    );
  });
});

test('a network failure or malformed provider response never resolves as a token/verification success', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  await withPaymentEnv({
    NODE_ENV: 'test',
    PAYMENT_PROVIDER: 'zibal',
    ZIBAL_MERCHANT: 'zibal',
    PAYMENT_CALLBACK_BASE_URL: 'https://preview.example.test',
  }, async () => {
    try {
      globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
      const provider = getPaymentProvider();
      await assert.rejects(
        provider.createPayment({ orderId: 'order-2', amountMinor: 1000n, currencyCode: 'IRR', callbackUri: 'https://preview.example.test/cb' }),
        (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_provider_unavailable',
      );

      globalThis.fetch = (async () => new Response('not json', { status: 200 })) as typeof fetch;
      await assert.rejects(
        provider.verifyPayment({ providerPaymentId: '991001', amountMinor: 1000n, currencyCode: 'IRR' }),
        (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_provider_invalid_response',
      );

      globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 500 })) as typeof fetch;
      await assert.rejects(
        provider.verifyPayment({ providerPaymentId: '991001', amountMinor: 1000n, currencyCode: 'IRR' }),
        (error: unknown) => error instanceof PaymentProviderError && error.code === 'payment_provider_unavailable',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('isProviderPaymentId and paymentRedirectUrl stay provider-scoped (no cross-provider id reuse)', () => {
  assert.equal(isProviderPaymentId('zibal', '991001'), true);
  assert.equal(isProviderPaymentId('zibal', 'not-a-track-id'), false);
  assert.equal(isProviderPaymentId('nextpay', '991001'), false);
  assert.equal(paymentRedirectUrl('zibal', '991001'), 'https://gateway.zibal.ir/start/991001');
  assert.equal(paymentRedirectUrl('zibal', 'garbage'), null);
});

test('zibalVerificationDisposition only ever credits on code 100, everything else stays pending or fails', () => {
  assert.equal(zibalVerificationDisposition(100), 'succeeded');
  assert.equal(zibalVerificationDisposition(-1), 'pending');
  for (const code of [102, 103, 104, 105, 106, 113, 201, -2]) {
    assert.equal(zibalVerificationDisposition(code), 'failed');
  }
});

test('Zibal callbacks are untrusted input that only ever resolve to the server-authoritative verify path', () => {
  assert.match(paymentRoutes, /paymentVerificationDisposition\(row\.provider, verified\.providerCode\)/);
  assert.match(paymentRoutes, /verified\.orderId !== row\.id/);
  assert.match(paymentRoutes, /verified\.amountMinor !== BigInt\(row\.amount_minor\)/);
  assert.match(paymentRoutes, /\$\{current\.provider\}_verified/);
  // The extra belt-and-suspenders guard: a disposition of "succeeded" is never
  // trusted alone if the adapter itself didn't mark the response paid.
  assert.match(paymentRoutes, /!verified\.paid && disposition === 'succeeded'/);

  const zibalCallbackSource = paymentRoutes.slice(paymentRoutes.indexOf('export async function zibalCallback'));
  // The callback route only resolves trackId -> attempt row and always defers
  // to verifyAndFinalizeAttempt; it must never itself touch wallets/ledgers.
  assert.doesNotMatch(zibalCallbackSource, /UPDATE app\.wallets|INSERT INTO app\.wallet_transactions/);
  assert.match(zibalCallbackSource, /verifyAndFinalizeAttempt\(row, trackId\)/);

  const zibalCallbackLine = handler.split('\n').find((line) => line.includes("'/v1/payments/zibal/callback'"));
  const topupCreateLine = handler.split('\n').find((line) => line.includes("url.pathname === '/v1/wallet/topups'"));
  assert.ok(zibalCallbackLine);
  assert.ok(topupCreateLine);
  assert.doesNotMatch(zibalCallbackLine, /requireCallerClosedBetaEnabled/);
  assert.match(topupCreateLine, /requireCallerClosedBetaEnabled\(\)/);
});

test('a duplicate/replayed Zibal callback with a tampered trackId is rejected before touching any attempt row', () => {
  assert.match(paymentRoutes, /if \(!isProviderPaymentId\('zibal', trackId\)\) throw new HttpError\(400, 'invalid_payment_callback'\);/);
});

test('payment callback base URL never falls back to any hardcoded origin in production, including the retired one', () => {
  assert.doesNotMatch(paymentRoutes, /https:\/\/yeki-hast-theta\.vercel\.app/);
  const callbackUriSource = paymentRoutes.slice(
    paymentRoutes.indexOf('function paymentCallbackUri'),
    paymentRoutes.indexOf('function paymentUrl'),
  );
  assert.match(callbackUriSource, /NODE_ENV === 'production'\) throw new HttpError\(503, 'payment_not_configured'\)/);
  assert.doesNotMatch(callbackUriSource, /vercel\.app/);
});
