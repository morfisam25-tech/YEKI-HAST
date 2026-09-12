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
    FARAZSMS_FROM_NUMBER: undefined,
    FARAZSMS_OTP_PARAMETER_NAME: undefined,
    FARAZSMS_OTP_PATTERN_APPROVED: undefined,
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));

  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'pattern_123',
    FARAZSMS_FROM_NUMBER: '+983000505',
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'false',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));
});

test('FarazSMS/IPPanel Pattern request matches current documented contract and returns provider reference', async () => {
  const beforeFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'pattern_123',
    FARAZSMS_FROM_NUMBER: '+983000505',
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        data: { message_outbox_ids: [1123544244] },
        meta: { status: true, message_code: '200-1' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    try {
      const result = await getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '654321', ttlSeconds: 300 });
      assert.equal(capturedUrl, 'https://edge.ippanel.com/v1/api/send');
      assert.equal(capturedInit?.method, 'POST');
      const headers = new Headers(capturedInit?.headers);
      assert.equal(headers.get('authorization'), 'test-key');
      assert.equal(headers.get('content-type'), 'application/json');
      assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
        sending_type: 'pattern',
        from_number: '+983000505',
        code: 'pattern_123',
        recipients: ['+989123456789'],
        params: { code: '654321' },
      });
      assert.deepEqual(result, {
        provider: 'farazsms',
        templateIdentifier: 'pattern_123',
        providerReferenceId: '1123544244',
      });
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('FarazSMS normalizes temporary and permanent provider errors without exposing response bodies', async () => {
  const beforeFetch = globalThis.fetch;
  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'pattern_123',
    FARAZSMS_FROM_NUMBER: '+983000505',
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    try {
      globalThis.fetch = (async () => new Response('provider-internal-detail', { status: 503 })) as typeof fetch;
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.message === 'sms_delivery_failed'
          && error.kind === 'temporary_unavailable'
          && error.retryable
          && error.statusCode === 503,
      );

      globalThis.fetch = (async () => new Response('provider-internal-detail', { status: 401 })) as typeof fetch;
      await assert.rejects(
        getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 }),
        (error: unknown) => error instanceof SmsProviderError
          && error.message === 'sms_delivery_failed'
          && error.kind === 'authentication_failed'
          && !error.retryable
          && error.statusCode === 401,
      );
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});

test('FarazSMS accepts documented 2xx Pattern responses even when no response body is returned', async () => {
  const beforeFetch = globalThis.fetch;
  await withAsyncEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'farazsms',
    FARAZSMS_API_KEY: 'test-key',
    FARAZSMS_PATTERN_CODE: 'pattern_123',
    FARAZSMS_FROM_NUMBER: '+983000505',
    FARAZSMS_OTP_PARAMETER_NAME: 'code',
    FARAZSMS_OTP_PATTERN_APPROVED: 'true',
  }, async () => {
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;
    try {
      const result = await getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 });
      assert.equal(result.provider, 'farazsms');
      assert.equal(result.providerReferenceId, undefined);
    } finally {
      globalThis.fetch = beforeFetch;
    }
  });
});
