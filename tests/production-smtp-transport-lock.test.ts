import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

const lockedInputs = [
  'PRODUCTION_SMTP_HOST',
  'PRODUCTION_SMTP_PORT',
  'PRODUCTION_SMTP_SECURE',
  'PRODUCTION_SMTP_USERNAME',
  'PRODUCTION_SMTP_FROM_EMAIL',
  'PRODUCTION_SMTP_FROM_NAME',
];

test('technical beta source-locks Gmail SMTP transport before using the app password', () => {
  assert.match(envSync, /const DEFAULT_SMTP_HOST = 'smtp\.gmail\.com'/);
  assert.match(envSync, /const DEFAULT_SMTP_PORT = '465'/);
  assert.match(envSync, /const DEFAULT_SMTP_SECURE = 'true'/);
  assert.match(envSync, /const DEFAULT_MAILBOX_EMAIL = 'sales@uniqueholding\.com\.tr'/);
  for (const name of lockedInputs) {
    assert.match(envSync, new RegExp(`requireAbsentOrExact\\('${name}'`));
  }
  assert.match(envSync, /const smtpHost = DEFAULT_SMTP_HOST/);
  assert.match(envSync, /const smtpPort = DEFAULT_SMTP_PORT/);
  assert.match(envSync, /const smtpSecure = DEFAULT_SMTP_SECURE/);
  assert.match(envSync, /const smtpUsername = DEFAULT_MAILBOX_EMAIL/);
  assert.match(envSync, /const smtpPassword = required\('PRODUCTION_SMTP_PASSWORD'\)/);
});
