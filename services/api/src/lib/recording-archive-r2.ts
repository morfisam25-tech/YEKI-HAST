import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const ARCHIVE_AAD = Buffer.from('listener-recording-archive-reference:v1', 'utf8');
const SIGV4_SERVICE = 's3';
const SIGV4_REGION = 'auto';

export class RecordingArchiveError extends Error {
  public code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

export interface R2ArchiveConfig {
  enabled: true;
  accountId: string;
  bucket: string;
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface RecordingArchiveReference {
  version: 1;
  bucket: string;
  key: string;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export function readR2ArchiveConfig(): R2ArchiveConfig | null {
  const enabledRaw = env('CALL_RECORDING_ARCHIVE_R2_ENABLED').toLowerCase();
  const enabled = enabledRaw === 'true' || enabledRaw === '1';
  const anyArchiveValue = [
    enabledRaw,
    env('CALL_RECORDING_ARCHIVE_R2_ACCOUNT_ID'),
    env('CALL_RECORDING_ARCHIVE_R2_BUCKET'),
    env('CALL_RECORDING_ARCHIVE_R2_PATH'),
    env('CALL_RECORDING_ARCHIVE_R2_ACCESS_KEY_ID'),
    env('CALL_RECORDING_ARCHIVE_R2_SECRET_ACCESS_KEY'),
  ].some(Boolean);

  if (!anyArchiveValue) return null;
  if (!enabled) throw new RecordingArchiveError('recording_archive_disabled_or_invalid');

  const accountId = env('CALL_RECORDING_ARCHIVE_R2_ACCOUNT_ID');
  const bucket = env('CALL_RECORDING_ARCHIVE_R2_BUCKET');
  const accessKeyId = env('CALL_RECORDING_ARCHIVE_R2_ACCESS_KEY_ID');
  const secretAccessKey = env('CALL_RECORDING_ARCHIVE_R2_SECRET_ACCESS_KEY');
  const rawPath = env('CALL_RECORDING_ARCHIVE_R2_PATH');
  const path = rawPath.replace(/^\/+|\/+$/g, '');

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new RecordingArchiveError('recording_archive_config_incomplete');
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new RecordingArchiveError('recording_archive_bucket_invalid');
  }
  if (path && (path.includes('..') || path.includes('\\'))) {
    throw new RecordingArchiveError('recording_archive_path_invalid');
  }

  return { enabled: true, accountId, bucket, path, accessKeyId, secretAccessKey };
}

export function requireR2ArchiveConfig(): R2ArchiveConfig {
  const config = readR2ArchiveConfig();
  if (!config) throw new RecordingArchiveError('recording_archive_not_configured');
  return config;
}

function activeDataEncryptionKey(): { id: string; key: Buffer } {
  const id = env('ACTIVE_DATA_ENCRYPTION_KEY_ID');
  const rawRing = env('DATA_ENCRYPTION_KEYS');
  if (!id || !rawRing) throw new RecordingArchiveError('recording_archive_encryption_not_configured');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRing);
  } catch {
    throw new RecordingArchiveError('recording_archive_encryption_keyring_invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RecordingArchiveError('recording_archive_encryption_keyring_invalid');
  }
  const value = (parsed as Record<string, unknown>)[id];
  if (typeof value !== 'string' || !value) {
    throw new RecordingArchiveError('recording_archive_active_encryption_key_missing');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new RecordingArchiveError('recording_archive_encryption_key_invalid');
  return { id, key };
}

function keyById(id: string): Buffer {
  const rawRing = env('DATA_ENCRYPTION_KEYS');
  if (!rawRing) throw new RecordingArchiveError('recording_archive_encryption_not_configured');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRing);
  } catch {
    throw new RecordingArchiveError('recording_archive_encryption_keyring_invalid');
  }
  const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)[id]
    : null;
  if (typeof value !== 'string' || !value) {
    throw new RecordingArchiveError('recording_archive_encryption_key_missing');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new RecordingArchiveError('recording_archive_encryption_key_invalid');
  return key;
}

export function encryptRecordingArchiveReference(
  reference: RecordingArchiveReference,
): { ciphertext: string; keyVersion: string } {
  const { id, key } = activeDataEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(ARCHIVE_AAD);
  const plaintext = Buffer.from(JSON.stringify(reference), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = [
    'v1',
    id,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
  return { ciphertext, keyVersion: id };
}

export function decryptRecordingArchiveReference(
  ciphertext: string,
  expectedKeyVersion?: string | null,
): RecordingArchiveReference {
  const parts = ciphertext.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') {
    throw new RecordingArchiveError('recording_archive_reference_invalid');
  }
  const [, keyVersion, ivEncoded, tagEncoded, encryptedEncoded] = parts;
  if (expectedKeyVersion && expectedKeyVersion !== keyVersion) {
    throw new RecordingArchiveError('recording_archive_reference_key_version_mismatch');
  }
  const key = keyById(keyVersion);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'));
    decipher.setAAD(ARCHIVE_AAD);
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
      decipher.final(),
    ]);
    const parsed = JSON.parse(plaintext.toString('utf8')) as Partial<RecordingArchiveReference>;
    if (parsed.version !== 1 || typeof parsed.bucket !== 'string' || typeof parsed.key !== 'string') {
      throw new Error('shape');
    }
    return parsed as RecordingArchiveReference;
  } catch (error) {
    if (error instanceof RecordingArchiveError) throw error;
    throw new RecordingArchiveError('recording_archive_reference_decrypt_failed');
  }
}

// Cloudflare documents that external-storage recordings are written beneath
// `storage_config.path` and use the exact `output_file_name` returned by the
// recording details API. We derive no provider-specific ID or guessed suffix.
export function realtimeKitArchiveObjectKey(outputFileName: string, path: string): string {
  const name = outputFileName.trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new RecordingArchiveError('recording_archive_output_file_name_invalid');
  }
  const prefix = path.replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${name}` : name;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKeyPath(key: string): string {
  return `/${key.split('/').map(encodeRfc3986).join('/')}`;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function signingKey(secret: string, dateStamp: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, SIGV4_REGION);
  const serviceKey = hmac(regionKey, SIGV4_SERVICE);
  return hmac(serviceKey, 'aws4_request');
}

function amzTime(now: Date): { timestamp: string; dateStamp: string } {
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { timestamp, dateStamp: timestamp.slice(0, 8) };
}

function archiveHost(config: R2ArchiveConfig): string {
  return `${config.accountId}.r2.cloudflarestorage.com`;
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

export function presignR2ObjectUrl(input: {
  method: 'GET' | 'HEAD' | 'DELETE';
  key: string;
  expiresInSeconds: number;
  now?: Date;
  config?: R2ArchiveConfig;
}): { url: string; expiresAt: string } {
  const config = input.config ?? requireR2ArchiveConfig();
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 3600) {
    throw new RecordingArchiveError('recording_archive_presign_ttl_invalid');
  }
  const now = input.now ?? new Date();
  const { timestamp, dateStamp } = amzTime(now);
  const host = archiveHost(config);
  const objectPath = encodeKeyPath(`${config.bucket}/${input.key}`);
  const credentialScope = `${dateStamp}/${SIGV4_REGION}/${SIGV4_SERVICE}/aws4_request`;
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const query = canonicalQuery(params);
  const canonicalRequest = [
    input.method,
    objectPath,
    query,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', signingKey(config.secretAccessKey, dateStamp))
    .update(stringToSign)
    .digest('hex');
  const url = `https://${host}${objectPath}?${query}&X-Amz-Signature=${signature}`;
  return {
    url,
    expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1_000).toISOString(),
  };
}

export async function r2ArchiveObjectExists(
  key: string,
  config: R2ArchiveConfig = requireR2ArchiveConfig(),
): Promise<boolean> {
  const signed = presignR2ObjectUrl({ method: 'HEAD', key, expiresInSeconds: 30, config });
  const response = await fetch(signed.url, { method: 'HEAD', redirect: 'error' });
  if (response.status === 404) return false;
  if (!response.ok) throw new RecordingArchiveError('recording_archive_head_failed');
  return true;
}

export async function deleteR2ArchiveObject(
  key: string,
  config: R2ArchiveConfig = requireR2ArchiveConfig(),
): Promise<void> {
  const signed = presignR2ObjectUrl({ method: 'DELETE', key, expiresInSeconds: 30, config });
  const response = await fetch(signed.url, { method: 'DELETE', redirect: 'error' });
  if (response.status === 404) return;
  if (!response.ok) throw new RecordingArchiveError('recording_archive_delete_failed');
}

export function issueR2PresignedPlaybackUrl(input: {
  key: string;
  ttlSeconds: number;
  now?: Date;
  config?: R2ArchiveConfig;
}): { playbackUrl: string; expiresAt: string } {
  const signed = presignR2ObjectUrl({
    method: 'GET',
    key: input.key,
    expiresInSeconds: input.ttlSeconds,
    now: input.now,
    config: input.config,
  });
  return { playbackUrl: signed.url, expiresAt: signed.expiresAt };
}
