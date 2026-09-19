import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  decryptRecordingArchiveReference,
  encryptRecordingArchiveReference,
  issueR2PresignedPlaybackUrl,
  readR2ArchiveConfig,
  realtimeKitArchiveObjectKey,
  r2ArchiveObjectExists,
  RecordingArchiveError,
  type R2ArchiveConfig,
} from '../services/api/src/lib/recording-archive-r2.ts';
import { capPlaybackTtlSeconds } from '../services/api/src/providers/recording-playback-resolver.ts';
import { isRecordingArchivePurgeEligible } from '../services/api/src/services/recording-archive.ts';

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { fn(); } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const fakeConfig: R2ArchiveConfig = {
  enabled: true,
  accountId: '0123456789abcdef0123456789abcdef',
  bucket: 'yeki-hast-recording-archive-preview-w88',
  path: 'listener-recordings-preview',
  accessKeyId: 'FAKEACCESSKEY',
  secretAccessKey: 'fake-secret-not-a-real-credential',
};

test('archive config fails closed when enabled but incomplete', () => {
  withEnv({
    CALL_RECORDING_ARCHIVE_R2_ENABLED: 'true',
    CALL_RECORDING_ARCHIVE_R2_ACCOUNT_ID: 'acc',
    CALL_RECORDING_ARCHIVE_R2_BUCKET: undefined,
    CALL_RECORDING_ARCHIVE_R2_ACCESS_KEY_ID: undefined,
    CALL_RECORDING_ARCHIVE_R2_SECRET_ACCESS_KEY: undefined,
  }, () => {
    assert.throws(
      () => readR2ArchiveConfig(),
      (error: unknown) => error instanceof RecordingArchiveError
        && error.code === 'recording_archive_config_incomplete',
    );
  });
});

test('durable archive reference is AES-GCM ciphertext and round-trips through the existing data key ring', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  withEnv({
    ACTIVE_DATA_ENCRYPTION_KEY_ID: 'k-test',
    DATA_ENCRYPTION_KEYS: JSON.stringify({ 'k-test': key }),
  }, () => {
    const reference = {
      version: 1 as const,
      bucket: fakeConfig.bucket,
      key: 'listener-recordings-preview/recording-file.mp4',
    };
    const encrypted = encryptRecordingArchiveReference(reference);
    assert.equal(encrypted.keyVersion, 'k-test');
    assert.doesNotMatch(encrypted.ciphertext, /recording-file\.mp4/);
    assert.doesNotMatch(encrypted.ciphertext, new RegExp(fakeConfig.bucket));
    assert.deepEqual(
      decryptRecordingArchiveReference(encrypted.ciphertext, encrypted.keyVersion),
      reference,
    );
  });
});

test('RealtimeKit object key uses only documented path + output_file_name and rejects a wrong/nested object name', () => {
  assert.equal(
    realtimeKitArchiveObjectKey('room_20260919.mp4', 'listener-recordings-preview'),
    'listener-recordings-preview/room_20260919.mp4',
  );
  assert.throws(
    () => realtimeKitArchiveObjectKey('../wrong/object.mp4', 'listener-recordings-preview'),
    /recording_archive_output_file_name_invalid/,
  );
});

test('missing private R2 object returns false rather than producing playback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  try {
    assert.equal(await r2ArchiveObjectExists('listener-recordings-preview/missing.mp4', fakeConfig), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('presign TTL is capped by remaining playback grant lifetime', () => {
  const now = new Date('2026-09-19T08:00:00.000Z');
  assert.equal(capPlaybackTtlSeconds({
    configuredTtlSeconds: 300,
    grantExpiresAt: '2026-09-19T08:00:42.900Z',
    now,
  }), 42);
  assert.equal(capPlaybackTtlSeconds({
    configuredTtlSeconds: 30,
    grantExpiresAt: '2026-09-19T08:05:00.000Z',
    now,
  }), 30);
});

test('expired grant produces zero TTL and can never be presigned', () => {
  const now = new Date('2026-09-19T08:00:00.000Z');
  assert.equal(capPlaybackTtlSeconds({
    configuredTtlSeconds: 300,
    grantExpiresAt: '2026-09-19T07:59:59.999Z',
    now,
  }), 0);
});

test('presigned GET is direct R2, short-lived, and contains no secret access key', () => {
  const signed = issueR2PresignedPlaybackUrl({
    key: 'listener-recordings-preview/a.mp4',
    ttlSeconds: 42,
    now: new Date('2026-09-19T08:00:00.000Z'),
    config: fakeConfig,
  });
  assert.match(signed.playbackUrl, /^https:\/\/yeki-hast-recording-archive-preview-w88\.[^.]+\.r2\.cloudflarestorage\.com\//);
  assert.match(signed.playbackUrl, /X-Amz-Expires=42/);
  assert.doesNotMatch(signed.playbackUrl, new RegExp(fakeConfig.secretAccessKey));
});

test('legal hold blocks purge; ordinary expired recording is purge eligible', () => {
  const now = new Date('2026-09-19T08:00:00.000Z');
  assert.equal(isRecordingArchivePurgeEligible({
    legalHold: true,
    purgeEligibleAt: '2026-09-01T00:00:00.000Z',
    purgedAt: null,
  }, now), false);
  assert.equal(isRecordingArchivePurgeEligible({
    legalHold: false,
    purgeEligibleAt: '2026-09-01T00:00:00.000Z',
    purgedAt: null,
  }, now), true);
});

test('authorization source still requires recording_admin and exact case match before resolver issuance', async () => {
  const source = await readFile(new URL('../services/api/src/routes/admin-recording.ts', import.meta.url), 'utf8');
  assert.match(source, /requireAdminCapability\(req, RECORDING_CAPABILITY\)/);
  assert.match(source, /recording_case_mismatch/);
  assert.match(source, /grantExpiresAt: insertedRow\.expires_at/);
});

test('signed playback URL is never written to audit metadata or persistence SQL', async () => {
  const source = await readFile(new URL('../services/api/src/routes/admin-recording.ts', import.meta.url), 'utf8');
  const auditSql = source.match(/INSERT INTO app\.audit_logs[\s\S]*?return \{ \.\.\.insertedRow, resolution \};/)?.[0] ?? '';
  assert.doesNotMatch(auditSql, /playbackUrl/);
  assert.doesNotMatch(auditSql, /storage_reference_ciphertext/);
});

test('provider/R2 credentials are never serialized into archive reference ciphertext plaintext contract', () => {
  const key = Buffer.alloc(32, 11).toString('base64');
  withEnv({
    ACTIVE_DATA_ENCRYPTION_KEY_ID: 'k-test',
    DATA_ENCRYPTION_KEYS: JSON.stringify({ 'k-test': key }),
  }, () => {
    const encrypted = encryptRecordingArchiveReference({
      version: 1,
      bucket: fakeConfig.bucket,
      key: 'listener-recordings-preview/x.mp4',
    });
    const decoded = decryptRecordingArchiveReference(encrypted.ciphertext, encrypted.keyVersion);
    assert.deepEqual(Object.keys(decoded).sort(), ['bucket', 'key', 'version']);
    assert.equal('accessKeyId' in decoded, false);
    assert.equal('secretAccessKey' in decoded, false);
  });
});
