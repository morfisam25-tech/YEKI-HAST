import { Buffer } from 'node:buffer';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function strongSecret(name) {
  const value = required(name);
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters`);
}

function integer(name, fallback, min, max) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is invalid`);
  return value;
}

function boolean(name) {
  const value = required(name).toLowerCase();
  if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false`);
  return value === 'true';
}

function optionalBoolean(name, fallback = false) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = raw.toLowerCase();
  if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false`);
  return value === 'true';
}

function emailAddress(name) {
  const value = required(name).toLowerCase();
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.') || /\s|[\r\n]/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function publicHttpsUrl(name) {
  const value = required(name);
  let url;
  try { url = new URL(value); }
  catch { throw new Error(`${name} must be a valid URL`); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error(`${name} must be a public HTTPS URL without embedded credentials`);
  }
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error(`${name} must not point to localhost`);
  }
  return value;
}

function e164(name) {
  const value = required(name);
  if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error(`${name} must be valid E.164`);
  return value;
}

function bootstrapExpiry(name) {
  const raw = required(name);
  const expiresAt = Date.parse(raw);
  if (!Number.isFinite(expiresAt)) throw new Error(`${name} must be a valid timestamp`);
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0 || remainingMs > 30 * 60 * 1000) {
    throw new Error(`${name} must be in the next 30 minutes`);
  }
  return raw;
}

if (process.env.NODE_ENV !== 'production') throw new Error('NODE_ENV must be production');
if (process.env.DEV_EXPOSE_OTP === 'true') throw new Error('DEV_EXPOSE_OTP must not be enabled in production');

strongSecret('PHONE_HASH_PEPPER');
strongSecret('EMAIL_HASH_PEPPER');
strongSecret('IP_HASH_PEPPER');
strongSecret('OTP_HASH_PEPPER');
strongSecret('KYC_HASH_PEPPER');

const activeKeyId = required('ACTIVE_DATA_ENCRYPTION_KEY_ID');
if (!/^[A-Za-z0-9_-]{1,64}$/.test(activeKeyId)) throw new Error('ACTIVE_DATA_ENCRYPTION_KEY_ID is invalid');

let keyRing;
try { keyRing = JSON.parse(required('DATA_ENCRYPTION_KEYS')); }
catch { throw new Error('DATA_ENCRYPTION_KEYS must be valid JSON'); }
if (!keyRing || typeof keyRing !== 'object' || Array.isArray(keyRing)) throw new Error('DATA_ENCRYPTION_KEYS must be an object');
const activeKey = keyRing[activeKeyId];
if (typeof activeKey !== 'string' || Buffer.from(activeKey, 'base64').length !== 32) {
  throw new Error('Active data encryption key must decode to 32 bytes');
}

const emailProvider = required('EMAIL_PROVIDER');
if (emailProvider !== 'smtp') throw new Error('Production EMAIL_PROVIDER must be smtp');
required('SMTP_HOST');
integer('SMTP_PORT', undefined, 1, 65535);
boolean('SMTP_SECURE');
required('SMTP_USERNAME');
required('SMTP_PASSWORD');
emailAddress('SMTP_FROM_EMAIL');

const bootstrapEnabled = optionalBoolean('BOOTSTRAP_ADMIN_ENABLED', false);
const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const bootstrapPhone = process.env.BOOTSTRAP_ADMIN_PHONE_E164?.trim();
const bootstrapExpiresAt = process.env.BOOTSTRAP_ADMIN_EXPIRES_AT?.trim();
if (bootstrapEnabled) {
  const configuredIdentityCount = Number(Boolean(bootstrapEmail)) + Number(Boolean(bootstrapPhone));
  if (configuredIdentityCount !== 1) {
    throw new Error('Exactly one bootstrap admin identity must be configured when BOOTSTRAP_ADMIN_ENABLED=true');
  }
  if (bootstrapEmail) emailAddress('BOOTSTRAP_ADMIN_EMAIL');
  if (bootstrapPhone) e164('BOOTSTRAP_ADMIN_PHONE_E164');
  bootstrapExpiry('BOOTSTRAP_ADMIN_EXPIRES_AT');
} else if (bootstrapEmail || bootstrapPhone || bootstrapExpiresAt) {
  throw new Error('Bootstrap admin identity and expiry must be removed when BOOTSTRAP_ADMIN_ENABLED is false');
}

const smsProvider = process.env.SMS_PROVIDER?.trim();
if (smsProvider) {
  if (smsProvider === 'dev') throw new Error('dev SMS provider is forbidden in production');
  if (smsProvider === 'kavenegar') {
    required('KAVENEGAR_API_KEY');
    required('KAVENEGAR_OTP_TEMPLATE');
  } else if (smsProvider === 'ippanel') {
    required('IPPANEL_API_KEY');
    required('IPPANEL_PATTERN_CODE');
    required('IPPANEL_FROM_NUMBER');
  } else if (smsProvider === 'smsir') {
    required('SMSIR_API_KEY');
    integer('SMSIR_OTP_TEMPLATE_ID', undefined, 1, Number.MAX_SAFE_INTEGER);
    const parameterName = process.env.SMSIR_OTP_PARAMETER_NAME?.trim() || 'CODE';
    if (!/^[A-Za-z0-9_]{1,32}$/.test(parameterName)) throw new Error('SMSIR_OTP_PARAMETER_NAME is invalid');
    if (process.env.SMSIR_OTP_TEMPLATE_APPROVED?.trim().toLowerCase() !== 'true') {
      throw new Error('SMSIR_OTP_TEMPLATE_APPROVED must be true in production');
    }
  } else {
    throw new Error(`Unsupported production SMS_PROVIDER: ${smsProvider}`);
  }
}

const callerClosedBetaEnabled = optionalBoolean('CALLER_CLOSED_BETA_ENABLED', false);
if (callerClosedBetaEnabled) {
  if (!boolean('COMMERCIAL_HOSTING_APPROVED')) {
    throw new Error('COMMERCIAL_HOSTING_APPROVED must be true before production Caller can open');
  }
  // Do not allow a caller-facing launch until the real public policy/support surfaces exist.
  publicHttpsUrl('PRIVACY_POLICY_URL');
  publicHttpsUrl('TERMS_OF_SERVICE_URL');
  publicHttpsUrl('ACCOUNT_DELETION_URL');
  emailAddress('SUPPORT_EMAIL');
  integer('CALLER_MINIMUM_AGE', undefined, 13, 99);
  required('CALLER_AGE_POLICY_VERSION');
}

integer('SESSION_TTL_HOURS', 720, 1, 8760);
integer('OTP_TTL_SECONDS', 300, 60, 1800);
integer('OTP_PHONE_LIMIT_PER_15M', 5, 1, 100);
integer('OTP_EMAIL_LIMIT_PER_15M', 5, 1, 100);
integer('OTP_EMAIL_IP_LIMIT_PER_15M', 200, 1, 1000);
integer('OTP_IP_LIMIT_PER_15M', 20, 1, 1000);
integer('OTP_GLOBAL_LIMIT_PER_15M', 1000, 1, 1_000_000);

console.log('production security config verified');