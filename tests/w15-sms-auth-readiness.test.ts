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

test('W15 SMS provider abstraction is explicit and has no automatic production fallback', () => {
  assert.match(smsProvider, /export interface SmsOtpProvider/);
  assert.match(smsProvider, /SmsProviderError/);
  assert.match(smsProvider, /retryable/);
  assert.match(smsProvider, /providerReferenceId/);
  assert.match(smsProvider, /templateIdentifier/);
  assert.match(smsProvider, /provider === 'smsir'/);
  assert.match(smsProvider, /provider === 'farazsms'/);
  assert.doesNotMatch(smsProvider, /catch[^]*getSmsProvider\(\)/);
  assert.match(smsProvider, /throw new Error\('sms_provider_not_configured'\)/);
});

test('W15 SMS.ir adapter uses Verify API and server-only credential', () => {
  assert.match(smsProvider, /https:\/\/api\.sms\.ir\/v1\/send\/verify/);
  assert.match(smsProvider, /'X-API-KEY'/);
  assert.match(smsProvider, /SMSIR_OTP_TEMPLATE_APPROVED/);
  assert.match(smsProvider, /phoneE164\.slice\(3\)/);
  assert.doesNotMatch(phoneScreen, /SMSIR_API_KEY|SMSIR_OTP_TEMPLATE_ID|X-API-KEY/);
  assert.doesNotMatch(emailScreen, /SMSIR_API_KEY|SMSIR_OTP_TEMPLATE_ID|X-API-KEY/);
});

test('W15 FarazSMS adapter uses IPPanel Edge Pattern API and E.164 recipient', () => {
  assert.match(smsProvider, /https:\/\/edge\.ippanel\.com\/v1\/api\/send/);
  assert.match(smsProvider, /sending_type: 'pattern'/);
  assert.match(smsProvider, /authorization: this\.#apiKey/);
  assert.match(smsProvider, /recipients: \[input\.phoneE164\]/);
  assert.match(smsProvider, /FARAZSMS_OTP_PATTERN_APPROVED/);
  assert.doesNotMatch(phoneScreen, /FARAZSMS_API_KEY|FARAZSMS_PATTERN_CODE|Authorization/);
  assert.doesNotMatch(emailScreen, /FARAZSMS_API_KEY|FARAZSMS_PATTERN_CODE|Authorization/);
});

test('W15 provider audit logging excludes phone and OTP values', () => {
  assert.match(auth, /otp_sms_accepted/);
  assert.match(auth, /providerReferenceId/);
  const acceptedLog = auth.match(/console\.info\('otp_sms_accepted',[\s\S]*?\n  \}\);/)?.[0] ?? '';
  assert.doesNotMatch(acceptedLog, /phoneE164/);
  assert.doesNotMatch(acceptedLog, /\bcode\b/);
});

test('W15 exposes dual auth while preserving the existing email OTP client', () => {
  assert.match(emailScreen, /ورود با ایمیل/);
  assert.match(emailScreen, /ورود با شماره موبایل/);
  assert.match(emailApi, /\/v1\/auth\/email\/request/);
  assert.match(emailApi, /\/v1\/auth\/email\/verify/);
  assert.match(emailAuth, /purpose = 'login_email'/);
  assert.match(emailAuth, /authMethod: 'email_otp'/);
});

test('W15 documents both providers and production approval guards without real secrets', () => {
  assert.match(envExample, /OTP_RESEND_COOLDOWN_SECONDS=60/);
  assert.match(envExample, /SMS_PROVIDER=dev/);
  assert.match(envExample, /SMSIR_API_KEY=\n/);
  assert.match(envExample, /SMSIR_OTP_TEMPLATE_ID=\n/);
  assert.match(envExample, /SMSIR_OTP_TEMPLATE_APPROVED=false/);
  assert.match(envExample, /FARAZSMS_API_KEY=\n/);
  assert.match(envExample, /FARAZSMS_PATTERN_CODE=\n/);
  assert.match(envExample, /FARAZSMS_FROM_NUMBER=\n/);
  assert.match(envExample, /FARAZSMS_OTP_PATTERN_APPROVED=false/);
});
