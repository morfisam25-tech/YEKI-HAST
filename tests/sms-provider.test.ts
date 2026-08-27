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

test('Kavenegar provider fails closed without credentials', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'kavenegar',
    KAVENEGAR_API_KEY: undefined,
    KAVENEGAR_OTP_TEMPLATE: undefined,
  }, () => {
    assert.throws(() => getSmsProvider(), /sms_provider_not_configured/);
  });
});

test('SMS.ir provider fails closed without API key', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: undefined,
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
  }, () => {
    assert.throws(() => getSmsProvider(), /sms_provider_not_configured/);
  });
});

test('SMS.ir provider fails closed without a valid template id', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: 'not-a-number',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
  }, () => {
    assert.throws(() => getSmsProvider(), /sms_provider_not_configured/);
  });
});

test('SMS.ir provider accepts a valid production configuration', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
  }, () => {
    assert.doesNotThrow(() => getSmsProvider());
  });
});
