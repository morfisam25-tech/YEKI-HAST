import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const verifier = fileURLToPath(new URL('../scripts/verify-production-security-config.mjs', import.meta.url));

const serviceAccount = JSON.stringify({
  type: 'service_account',
  client_email: 'mailer@test-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest-key-material\n-----END PRIVATE KEY-----\n',
  token_uri: 'https://oauth2.googleapis.com/token',
});

function baseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'production',
    DEV_EXPOSE_OTP: 'false',
    PHONE_HASH_PEPPER: 'test-phone-pepper-0000000000000000000000000000',
    EMAIL_HASH_PEPPER: 'test-email-pepper-0000000000000000000000000000',
    IP_HASH_PEPPER: 'test-ip-pepper-000000000000000000000000000000',
    OTP_HASH_PEPPER: 'test-otp-pepper-0000000000000000000000000000',
    KYC_HASH_PEPPER: 'test-kyc-pepper-0000000000000000000000000000',
    ACTIVE_DATA_ENCRYPTION_KEY_ID: 'k1',
    DATA_ENCRYPTION_KEYS: '{"k1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
    EMAIL_PROVIDER: 'gmail_api',
    GMAIL_SERVICE_ACCOUNT_JSON: serviceAccount,
    GMAIL_IMPERSONATED_USER: 'sales@uniqueholding.com.tr',
    GMAIL_FROM_EMAIL: 'sales@uniqueholding.com.tr',
    GMAIL_FROM_NAME: 'Yeki Hast',
    BOOTSTRAP_ADMIN_ENABLED: 'false',
    BOOTSTRAP_ADMIN_PHONE_E164: '',
    BOOTSTRAP_ADMIN_EMAIL: '',
    BOOTSTRAP_ADMIN_EXPIRES_AT: '',
    CALLER_CLOSED_BETA_ENABLED: 'true',
    COMMERCIAL_HOSTING_APPROVED: 'true',
    DATABASE_URL: 'postgresql://test:test@ep-test-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
    DB_POOL_MAX: '2',
    CALLER_MINIMUM_AGE: '18',
    CALLER_AGE_POLICY_VERSION: 'test-v1',
    PRIVACY_POLICY_URL: 'https://example.test/privacy',
    TERMS_OF_SERVICE_URL: 'https://example.test/terms',
    ACCOUNT_DELETION_URL: 'https://example.test/account/delete',
    SUPPORT_EMAIL: 'support@example.test',
  };
}

function runVerifier(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [verifier], {
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('caller-open production security config passes only with commercial hosting and complete public release surface', () => {
  const result = runVerifier(baseEnv());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /production security config verified/);
});

test('caller-open production security config fails closed without commercial hosting approval', () => {
  const env = baseEnv();
  env.COMMERCIAL_HOSTING_APPROVED = 'false';
  const result = runVerifier(env);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /COMMERCIAL_HOSTING_APPROVED must be true/);
});

test('caller-open production security config fails closed when commercial hosting approval is absent', () => {
  const env = baseEnv();
  delete env.COMMERCIAL_HOSTING_APPROVED;
  const result = runVerifier(env);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /COMMERCIAL_HOSTING_APPROVED is required/);
});

test('caller-open production security config fails closed when account deletion surface is absent', () => {
  const env = baseEnv();
  delete env.ACCOUNT_DELETION_URL;
  const result = runVerifier(env);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /ACCOUNT_DELETION_URL is required/);
});

test('caller-open production security config rejects a direct Neon runtime connection', () => {
  const env = baseEnv();
  env.DATABASE_URL = 'postgresql://test:test@ep-test.us-east-1.aws.neon.tech/neondb?sslmode=require';
  const result = runVerifier(env);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /pooled Neon endpoint/);
});

test('caller-open production security config rejects a per-instance pool above two connections', () => {
  const env = baseEnv();
  env.DB_POOL_MAX = '3';
  const result = runVerifier(env);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /DB_POOL_MAX is invalid/);
});
