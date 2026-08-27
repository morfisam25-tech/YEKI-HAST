import assert from 'node:assert/strict';
import test from 'node:test';
import { getSmsProvider } from '../services/api/src/providers/sms.ts';

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { fn(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('SMS.ir production stays disabled until template approval is explicitly acknowledged', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key-not-secret',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
    SMSIR_OTP_TEMPLATE_APPROVED: undefined,
  }, () => {
    assert.throws(() => getSmsProvider(), /sms_provider_not_configured/);
  });
});

test('SMS.ir production can initialize only after explicit approval acknowledgement', () => {
  withEnv({
    NODE_ENV: 'production',
    SMS_PROVIDER: 'smsir',
    SMSIR_API_KEY: 'test-key-not-secret',
    SMSIR_OTP_TEMPLATE_ID: '958161',
    SMSIR_OTP_PARAMETER_NAME: 'CODE',
    SMSIR_OTP_TEMPLATE_APPROVED: 'true',
  }, () => {
    assert.ok(getSmsProvider());
  });
});
