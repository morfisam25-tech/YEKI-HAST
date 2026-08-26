import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export function normalizeE164(input: string): string {
  const value = input.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error('invalid_e164');
  return value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function phoneHash(phoneE164: string): string {
  return createHmac('sha256', required('PHONE_HASH_PEPPER')).update(phoneE164).digest('hex');
}

export function ipHash(ip: string): string {
  return createHmac('sha256', required('IP_HASH_PEPPER')).update(ip).digest('hex');
}

export function otpHash(phoneE164: string, purpose: string, code: string): string {
  return createHmac('sha256', required('OTP_HASH_PEPPER'))
    .update(`${phoneE164}|${purpose}|${code}`)
    .digest('hex');
}

export function kycLookupHash(kind: 'national_id' | 'bank_iban', normalizedValue: string): string {
  return createHmac('sha256', required('KYC_HASH_PEPPER'))
    .update(`yeki-hast|kyc|${kind}|${normalizedValue}`)
    .digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function generateOtp(): string {
  return randomInt(100_000, 1_000_000).toString();
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface EncryptionKeyRing {
  activeKeyId: string;
  keys: Map<string, Buffer>;
}

function encryptionKeyRing(): EncryptionKeyRing {
  const activeKeyId = required('ACTIVE_DATA_ENCRYPTION_KEY_ID');
  const keyIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
  if (!keyIdPattern.test(activeKeyId)) {
    throw new Error('ACTIVE_DATA_ENCRYPTION_KEY_ID must match [A-Za-z0-9_-]{1,64}');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(required('DATA_ENCRYPTION_KEYS'));
  } catch {
    throw new Error('DATA_ENCRYPTION_KEYS must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('DATA_ENCRYPTION_KEYS must be a JSON object');
  }
  const keys = new Map<string, Buffer>();
  for (const [keyId, encoded] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof encoded !== 'string' || !keyIdPattern.test(keyId)) {
      throw new Error('DATA_ENCRYPTION_KEYS contains an invalid key id or entry');
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error(`DATA_ENCRYPTION_KEYS.${keyId} must decode to 32 bytes`);
    keys.set(keyId, key);
  }
  if (!keys.has(activeKeyId)) throw new Error('ACTIVE_DATA_ENCRYPTION_KEY_ID is not present in DATA_ENCRYPTION_KEYS');
  return { activeKeyId, keys };
}

export function validateSecurityEnv(): void {
  required('PHONE_HASH_PEPPER');
  required('IP_HASH_PEPPER');
  required('OTP_HASH_PEPPER');
  encryptionKeyRing();
}

export function validateKycSecurityEnv(): void {
  required('KYC_HASH_PEPPER');
  encryptionKeyRing();
}

export function encryptPrivateText(plaintext: string, aad: string): string {
  if (!aad) throw new Error('encryption AAD is required');
  const { activeKeyId, keys } = encryptionKeyRing();
  const key = keys.get(activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${activeKeyId}.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptPrivateText(payload: string, aad: string): string {
  if (!aad) throw new Error('encryption AAD is required');
  const [version, keyId, ivText, tagText, dataText] = payload.split('.');
  if (version !== 'v1' || !keyId || !ivText || !tagText || !dataText) throw new Error('invalid_ciphertext');
  const { keys } = encryptionKeyRing();
  const key = keys.get(keyId);
  if (!key || key.length !== 32) throw new Error('unknown_encryption_key');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
