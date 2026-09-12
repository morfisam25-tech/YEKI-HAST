import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSmsProvider,
  SmsProviderError,
} from '../services/api/src/providers/sms.ts';

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

async function withAsyncEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { await fn(); }
  finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('dev SMS provider is forbidden in production', () => {
  withEnv({ NODE_ENV: 'production', SMS_PROVIDER: 'dev' }, () => {
    assert.throws(() => getSmsProvider(), /sms_provider_not_configured/);
  });
});

test('development can use dev SMS provider without credentials', () => {
  withEnv({ NODE_ENV: 'development', SMS_PROVIDER: 'dev' }, () => {
    assert.doesNotThrow(() => getSmsProvider());
  });
});

test('unsupported SMS provider fails closed', () => {
  withEnv({ NODE_ENV: 'production', SMS_PROVIDER: 'unsupported' }, () => {
    assert.throws(() => getSmsProvider(), /sms_provider_not_configured/);
  });
});

test('SMS.ir provider fails closed without complete or approved production configuration', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: undefined,
    SMSIR_OTP_TEMPLATE_ID: undefined,
    SMSIR_OTP_PARAMETER_NAME: undefined,
    SMSIR_OTP_TEMPLATE_APPROVED: undefined,
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));

  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
    SMSIR_OTP_TEMPLATE_APPROVED: 'false',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));
});

test('SMS.ir provider rejects invalid template or parameter configuration', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: 'not-a-number',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
    SMSIR_OTP_TEMPLATE_APPROVED: 'true',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));

  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'bad name',
    SMSIR_OTP_TEMPLATE_APPROVED: 'true',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));
});

test('SMS.ir Verify request matches current documented contract and returns provider reference', async () => {
  const beforeFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
    SMSIR_OTP_TEMPLATE_APPROVED: 'true',
  }, async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        status: 1,
        message: 'ok',
        data: { messageId: 89545112, cost: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    try {
      const result = await getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 });
      assert.equal(capturedUrl, 'https://api.sms.ir/v1/send/verify');
      assert.equal(capturedInit?.method, 'POST');
      const headers = new Headers(capturedInit?.headers);
      assert.equal(headers.get('X-API-KEY'), 'test-key');
      assert.equal(headers.get('content-type'), 'application/json');
      assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
        mobile: '9123456789',
        templateId: 958161,
        parameters: [{ name: 'CODE', value: '123456' }],
      });
      assert.deepEqual(result, {
        provider: 'smsir',
        templateIdentifier: '958161',
        providerReferenceId: '89545112',
      });
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('SMS.ir normalizes temporary/rate-limit and permanent provider errors', async () => {
  const beforeFetch = globalThis.fetch;
  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
    SMSIR_OTP_TEMPLATE_APPROVED: 'true',
  }, async () => {
    try {
      globalThis.fetch = (async () => new Response('busy', { status: 429 })) as typeof fetch;
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.message === 'sms_delivery_failed'
          && error.kind === 'rate_limited'
          && error.retryable
          && error.statusCode === 429,
      );

      globalThis.fetch = (async () => new Response('bad-template', { status: 400 })) as typeof fetch;
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.message === 'sms_delivery_failed'
          && error.kind === 'request_rejected'
          && !error.retryable
          && error.statusCode === 400,
      );
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('FarazSMS provider fails closed without complete or approved production configuration', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: undefined,
    FARAZSMS_PATTERN_CODE: undefined,
    FARAZSMS_LINE_NUMBER: undefined,
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: undefined,
    FARAZSMS_OTP_PATTERN_APPROVED: undefined,
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));

  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'SJ3FgPrE0C',
    FARAZSMS_LINE_NUMBER: '50002178584000',
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'false',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));

  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'SJ3FgPrE0C',
    FARAZSMS_LINE_NUMBER: undefined,
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));
});

test('FarazSMS official Pattern request uses Api-Key, national recipient, line and attributes', async () => {
  const beforeFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-secret-api-key',
    FARAZSMS_PATTERN_CODE: 'SJ3FgPrE0C',
    FARAZSMS_LINE_NUMBER: '50002178584000',
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: 'otp',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        status: 'success',
        data: 1123544244,
        messages: 'sent',
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    try {
      const result = await getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '654321', ttlSeconds: 300 });
      assert.equal(capturedUrl, 'https://api.iranpayamak.com/ws/v1/sms/pattern');
      assert.equal(capturedInit?.method, 'POST');
      const headers = new Headers(capturedInit?.headers);
      assert.equal(headers.get('Api-Key'), 'test-secret-api-key');
      assert.equal(headers.get('authorization'), null);
      assert.equal(headers.get('content-type'), 'application/json');
      const body = JSON.parse(String(capturedInit?.body));
      assert.deepEqual(body, {
        code: 'SJ3FgPrE0C',
        attributes: { otp: '654321' },
        recipient: '09123456789',
        line_number: '50002178584000',
        number_format: 'english',
      });
      assert.equal(JSON.stringify(body).includes('test-secret-api-key'), false);
      assert.deepEqual(result, {
        provider: 'farazsms',
        templateIdentifier: 'SJ3FgPrE0C',
        providerReferenceId: '1123544244',
      });
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('FarazSMS temporarily accepts legacy FARAZSMS_FROM_NUMBER as line-number fallback', async () => {
  const beforeFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | undefined;
  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'SJ3FgPrE0C',
    FARAZSMS_LINE_NUMBER: undefined,
    FARAZSMS_FROM_NUMBER: '50002178584000',
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ status: 'success', data: 1, messages: 'sent' }), { status: 201 });
    }) as typeof fetch;
    try {
      await getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 });
      assert.equal(capturedBody?.line_number, '50002178584000');
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('FarazSMS maps HTTP auth, rate-limit and temporary failures safely', async () => {
  const beforeFetch = globalThis.fetch;
  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-secret-api-key',
    FARAZSMS_PATTERN_CODE: 'SJ3FgPrE0C',
    FARAZSMS_LINE_NUMBER: '50002178584000',
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    try {
      for (const status of [401, 403]) {
        globalThis.fetch = (async () => new Response('secret-body', { status })) as typeof fetch;
        await assert.rejects(
          getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '987654', ttlSeconds: 300 }),
          (error: unknown) => error instanceof SmsProviderError
            && error.message === 'sms_delivery_failed'
            && error.kind === 'authentication_failed'
            && !error.retryable
            && error.statusCode === status,
        );
      }

      globalThis.fetch = (async () => new Response('busy', { status: 429 })) as typeof fetch;
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '987654', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.message === 'sms_delivery_failed'
          && error.kind === 'rate_limited'
          && error.retryable
          && error.statusCode === 429,
      );

      globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch;
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '987654', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.message === 'sms_delivery_failed'
          && error.kind === 'temporary_unavailable'
          && error.retryable
          && error.statusCode === 503,
      );

      globalThis.fetch = (async () => { throw new Error('network failed with test-secret-api-key 987654 09123456789'); }) as typeof fetch;
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '987654', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.message === 'sms_delivery_failed'
          && error.kind === 'temporary_unavailable'
          && error.retryable
          && error.statusCode === undefined,
      );
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('FarazSMS provider-declared rejection is sanitized and non-retryable', async () => {
  const beforeFetch = globalThis.fetch;
  const apiKey = 'test-secret-api-key';
  const otp = '987654';
  const phone = '+989123456789';
  const providerBody = JSON.stringify({ status: 'error', data: null, messages: `bad ${apiKey} ${otp} ${phone}` });

  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: apiKey,
    FARAZSMS_PATTERN_CODE: 'SJ3FgPrE0C',
    FARAZSMS_LINE_NUMBER: '50002178584000',
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    globalThis.fetch = (async () => new Response(providerBody, { status: 201 })) as typeof fetch;
    try {
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: phone, code: otp, ttlSeconds: 300 }),
        (error: unknown) => {
          assert.ok(error instanceof SmsProviderError);
          assert.equal(error.message, 'sms_delivery_failed');
          assert.equal(error.kind, 'request_rejected');
          assert.equal(error.retryable, false);
          assert.equal(error.statusCode, 201);
          const exposed = `${error.name}:${error.message}:${JSON.stringify(error)}`;
          assert.equal(exposed.includes(apiKey), false);
          assert.equal(exposed.includes(otp), false);
          assert.equal(exposed.includes(phone), false);
          assert.equal(exposed.includes('bad '), false);
          return true;
        },
      );
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('FarazSMS rejects non-Iranian OTP recipient before fetch', async () => {
  const beforeFetch = globalThis.fetch;
  let called = false;
  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'SJ3FgPrE0C',
    FARAZSMS_LINE_NUMBER: '50002178584000',
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    globalThis.fetch = (async () => { called = true; return new Response('{}', { status: 201 }); }) as typeof fetch;
    try {
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+12025550123', code: '123456', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.kind === 'request_rejected'
          && !error.retryable,
      );
      assert.equal(called, false);
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});
