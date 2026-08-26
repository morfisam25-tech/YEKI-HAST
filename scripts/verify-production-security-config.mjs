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
}

if (process.env.NODE_ENV !== 'production') throw new Error('NODE_ENV must be production');
if (process.env.DEV_EXPOSE_OTP === 'true') throw new Error('DEV_EXPOSE_OTP must not be enabled in production');

strongSecret('PHONE_HASH_PEPPER');
strongSecret('IP_HASH_PEPPER');
strongSecret('OTP_HASH_PEPPER');

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

const smsProvider = required('SMS_PROVIDER');
if (smsProvider !== 'kavenegar') throw new Error('Production SMS_PROVIDER must be kavenegar');
strongSecret('KAVENEGAR_API_KEY');
const template = required('KAVENEGAR_OTP_TEMPLATE');
if (!/^[A-Za-z0-9-]{1,100}$/.test(template)) throw new Error('KAVENEGAR_OTP_TEMPLATE is invalid');

integer('SESSION_TTL_HOURS', 720, 1, 8760);
integer('OTP_TTL_SECONDS', 300, 60, 1800);
integer('OTP_PHONE_LIMIT_PER_15M', 5, 1, 100);
integer('OTP_IP_LIMIT_PER_15M', 20, 1, 1000);
integer('OTP_GLOBAL_LIMIT_PER_15M', 1000, 1, 1_000_000);

console.log('production security config verified');
