import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const auth = readFileSync(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const emailAuth = readFileSync(new URL('../services/api/src/routes/auth-email.ts', import.meta.url), 'utf8');
const smsProvider = readFileSync(new URL('../services/api/src/providers/sms.ts', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const phoneScreen = readFileSync(new URL('../apps/mobile/src/PhoneAuthScreen.tsx', import.meta.url), 'utf8');
const emailScreen = readFileSync(new URL('../apps/mobile/src/EmailAuthScreen.tsx', import.meta.url), 'utf8');
const emailApi = readFileSync(new URL('../apps/mobile/src/email-auth-api.ts', import.meta.url), 'utf8');

test('W15 phone login is Iran-mobile-only and keeps secure OTP controls', () => {
  assert.match(auth, /normalizeIranMobile/);
  assert.match(auth, /OTP_RESEND_COOLDOWN_SECONDS/);
  assert.match(auth, /OTP_PHONE_LIMIT_PER_15M/);
  assert.match(auth, /OTP_IP_LIMIT_PER_15M/);
  assert.match(auth, /OTP_GLOBAL_LIMIT_PER_15M/);
  assert.match(auth, /attempt_count >= 5/);
  assert.match(auth, /expires_at > now\(\)/);
  assert.match(auth, /consumed_at IS NULL/);
  assert.match(auth, /SET consumed_at=now\(\)/);
  assert.match(auth, /safeEqualHex/);
  assert.match(auth, /sms_delivery_unavailable/);
  assert.match(auth, /NODE_ENV === 'development' && process\.env\.DEV_EXPOSE_OTP === 'true'/);
});

test('W15 SMS provider stays server-side and production dev bypass fails closed', () => {
  assert.match(smsProvider, /https:\/\/api\.sms\.ir\/v1\/send\/verify/);
  assert.match(smsProvider, /'X-API-KEY'/);
  assert.match(smsProvider, /process\.env\.NODE_ENV !== 'development'/);
  assert.match(smsProvider, /throw new Error\('sms_provider_not_configured'\)/);
  assert.doesNotMatch(phoneScreen, /SMSIR_API_KEY|SMSIR_OTP_TEMPLATE_ID|X-API-KEY/);
  assert.doesNotMatch(emailScreen, /SMSIR_API_KEY|SMSIR_OTP_TEMPLATE_ID|X-API-KEY/);
});

test('W15 exposes dual auth while preserving the existing email OTP client', () => {
  assert.match(emailScreen, /ورود با ایمیل/);
  assert.match(emailScreen, /ورود با شماره موبایل/);
  assert.match(emailApi, /\/v1\/auth\/email\/request/);
  assert.match(emailApi, /\/v1\/auth\/email\/verify/);
  assert.match(emailAuth, /purpose = 'login_email'/);
  assert.match(emailAuth, /authMethod: 'email_otp'/);
});

test('W15 documents cooldown and SMS.ir configuration without real secrets', () => {
  assert.match(envExample, /OTP_RESEND_COOLDOWN_SECONDS=60/);
  assert.match(envExample, /SMS_PROVIDER=dev/);
  assert.match(envExample, /SMSIR_API_KEY=\n/);
  assert.match(envExample, /SMSIR_OTP_TEMPLATE_ID=\n/);
  assert.match(envExample, /SMSIR_OTP_TEMPLATE_APPROVED=false/);
});
