import assert from 'node:assert/strict';
import test from 'node:test';
import { getSmsProvider } from '../services/api/src/providers/sms.ts';

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

test('SMS.ir provider fails closed without API key or template id', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: undefined,
    SMSIR_OTP_TEMPLATE_ID: undefined,
    SMSIR_OTP_PARAMETER_NAME: undefined,
  }, () => {
    assert.throws(() => getSmsProvider(), /sms_provider_not_configured/);
  });
});

test('SMS.ir provider rejects invalid template or parameter configuration', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: 'not-a-number',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));

  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'bad name',
  }, () => assert.throws(() => getSmsProvider(), /sms_provider_not_configured/));
});

test('SMS.ir Verify request uses documented endpoint and payload shape', async () => {
  const envNames = ['NODE_ENV', 'SMS_PROVIDER', 'SMSIR_API_KEY', 'SMSIR_OTP_TEMPLATE_ID', 'SMSIR_OTP_PARAMETER_NAME', 'SMSIR_OTP_TEMPLATE_APPROVED'] as const;
  const beforeEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  const beforeFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  process.env.NODE_ENV = 'production';
  process.env.SMS_PROVIDER = 'smsir';
  process.env.SMSIR_API_KEY = 'test-key';
  process.env.SMSIR_OTP_TEMPLATE_ID = '958161';
  process.env.SMSIR_OTP_PARAMETER_NAME = 'CODE';
  process.env.SMSIR_OTP_TEMPLATE_APPROVED = 'true';

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ status: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    await getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 });
    assert.equal(capturedUrl, 'https://api.sms.ir/v1/send/verify');
    assert.equal(capturedInit?.method, 'POST');
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get('X-API-KEY'), 'test-key');
    assert.equal(headers.get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      mobile: '09123456789',
      templateId: 958161,
      parameters: [{ name: 'CODE', value: '123456' }],
    });
  } finally {
    globalThis.fetch = beforeFetch;
    for (const name of envNames) {
      const value = beforeEnv.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('SMS.ir provider failure is sanitized and does not expose provider response details', async () => {
  const envNames = ['NODE_ENV', 'SMS_PROVIDER', 'SMSIR_API_KEY', 'SMSIR_OTP_TEMPLATE_ID', 'SMSIR_OTP_PARAMETER_NAME', 'SMSIR_OTP_TEMPLATE_APPROVED'] as const;
  const beforeEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  const beforeFetch = globalThis.fetch;

  process.env.NODE_ENV = 'production';
  process.env.SMS_PROVIDER = 'smsir';
  process.env.SMSIR_API_KEY = 'test-key';
  process.env.SMSIR_OTP_TEMPLATE_ID = '958161';
  process.env.SMSIR_OTP_PARAMETER_NAME = 'CODE';
  process.env.SMSIR_OTP_TEMPLATE_APPROVED = 'true';
  globalThis.fetch = (async () => new Response('provider-internal-detail', { status: 401 })) as typeof fetch;

  try {
    await assert.rejects(
      getSmsProvider().sendOtp({ phoneE164: '+989123456789', code: '123456', ttlSeconds: 300 }),
      (error: unknown) => error instanceof Error && error.message === 'sms_delivery_failed',
    );
  } finally {
    globalThis.fetch = beforeFetch;
    for (const name of envNames) {
      const value = beforeEnv.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
