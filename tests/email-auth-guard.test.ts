import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../packages/db/migrations/0002_email_auth.sql', import.meta.url), 'utf8');
const migrate = await readFile(new URL('../packages/db/src/migrate.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../services/api/src/routes/auth-email.ts', import.meta.url), 'utf8');
const smsRoute = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const provider = await readFile(new URL('../services/api/src/providers/email.ts', import.meta.url), 'utf8');
const smoke = await readFile(new URL('../scripts/smoke-production-email-auth.mjs', import.meta.url), 'utf8');
const security = await readFile(new URL('../services/api/src/lib/security.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const app = await readFile(new URL('../apps/mobile/App.tsx', import.meta.url), 'utf8');
const migrationManifest = await readFile(new URL('../scripts/current-migration-manifest.mjs', import.meta.url), 'utf8');
const verifyDb = await readFile(new URL('../scripts/verify-production-db.mjs', import.meta.url), 'utf8');
const verifySecurity = await readFile(new URL('../scripts/verify-production-security-config.mjs', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');

const migrationHash = createHash('sha256').update(migration).digest('hex');

test('email auth migration has the production-tracked canonical hash', () => {
  assert.equal(migrationHash, '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90');
  assert.match(migrate, /0002_email_auth\.sql/);
  assert.match(migrationManifest, /0002_email_auth\.sql/);
  assert.match(migrationManifest, /createHash\('sha256'\)\.update\(sql\)\.digest\('hex'\)/);
  assert.match(verifyDb, /currentMigrationEntries/);
  assert.match(verifyDb, /migration tracking mismatch/);
  assert.match(migrate, /Applied migration changed on disk/);
});

test('email identities and OTP challenges stay in private_data', () => {
  assert.match(migration, /private_data\.user_emails/);
  assert.match(migration, /private_data\.email_otp_challenges/);
  assert.match(migration, /email_hash char\(64\).*UNIQUE/);
  assert.doesNotMatch(migration, /app\.user_emails|app\.email_otp_challenges/);
});

test('email OTP is hashed, rate limited, attempt limited, and session-backed', () => {
  assert.match(security, /emailHash/);
  assert.match(security, /emailOtpHash/);
  assert.match(route, /OTP_EMAIL_LIMIT_PER_15M/);
  assert.match(route, /OTP_EMAIL_IP_LIMIT_PER_15M/);
  assert.match(route, /OTP_GLOBAL_LIMIT_PER_15M/);
  assert.match(route, /row\.attempt_count >= 5/);
  assert.match(route, /safeEqualHex/);
  assert.match(route, /private_data\.auth_sessions/);
  assert.match(route, /encryptPrivateText\(email/);
  assert.match(route, /INSERT INTO private_data\.user_emails\(\s*user_id, email_ciphertext, email_hash, email_verified_at\s*\)/);
  assert.doesNotMatch(route, /INSERT INTO private_data\.user_emails\(\s*user_id,\s*email\s*[,)]/);
});

test('email auth audit entity ids are explicitly text-cast when sharing a UUID parameter', () => {
  assert.match(route, /VALUES \(\$1,'admin_bootstrap_completed','admin_user',\$1::text,/);
  assert.match(route, /actor_user_id=\$1[\s\S]*entity_id=\$1::text[\s\S]*processingState/);
  assert.doesNotMatch(route, /entity_id=\$1\s*\n/);
});

test('browser-proxied email OTP uses a separate IP bucket without weakening phone OTP', () => {
  assert.match(route, /integerEnv\('OTP_EMAIL_IP_LIMIT_PER_15M', 200\)/);
  assert.doesNotMatch(route, /integerEnv\('OTP_IP_LIMIT_PER_15M', 20\)/);
  assert.match(smsRoute, /integerEnv\('OTP_IP_LIMIT_PER_15M', 20\)/);
  assert.doesNotMatch(smsRoute, /OTP_EMAIL_IP_LIMIT_PER_15M/);
  assert.match(envSync, /setPlain\('OTP_EMAIL_IP_LIMIT_PER_15M', '200'\)/);
  assert.match(envSync, /setPlain\('OTP_IP_LIMIT_PER_15M', '20'\)/);
  assert.match(verifySecurity, /integer\('OTP_EMAIL_IP_LIMIT_PER_15M', 200, 1, 1000\)/);
  assert.match(envExample, /OTP_EMAIL_IP_LIMIT_PER_15M=200/);
});

test('production email provider fails closed and uses fixed delegated Gmail API endpoints', () => {
  assert.match(provider, /dev email provider is forbidden in production/);
  assert.match(provider, /EMAIL_PROVIDER/);
  assert.match(provider, /provider === 'gmail_api'/);
  assert.match(provider, /https:\/\/oauth2\.googleapis\.com\/token/);
  assert.match(provider, /https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/);
  assert.match(provider, /https:\/\/www\.googleapis\.com\/auth\/gmail\.send/);
  assert.match(provider, /sign\('RSA-SHA256'/);
  assert.match(provider, /toString\('base64url'\)/);
  assert.doesNotMatch(provider, /AUTH LOGIN|smtp\.gmail\.com|SMTP_PASSWORD/);
  assert.doesNotMatch(provider, /console\.log\([^)]*(private_key|access_token|GMAIL_SERVICE_ACCOUNT_JSON)/i);
});

test('production Email OTP smoke reads the delivered message through delegated Gmail readonly API', () => {
  assert.match(provider, /`کد ورود شما: \$\{input\.code\}`/);
  assert.match(provider, /`To: <\$\{recipient\}>`/);
  assert.match(smoke, /https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/);
  assert.match(smoke, /labelIds=INBOX/);
  assert.match(smoke, /format=raw/);
  assert.match(smoke, /rawMessage\.match\(\/کد ورود شما:\\s\*\(\\d\{6\}\)\//);
  assert.match(smoke, /revoked\.status !== 401/);
  assert.doesNotMatch(smoke, /imap\.gmail\.com|PRODUCTION_SMTP_PASSWORD/);
  assert.doesNotMatch(smoke, /console\.log\([^\n]*(code|token|password|private_key)/i);
});

test('email routes are separate from legacy SMS OTP and primary mobile UI uses email', () => {
  assert.match(handler, /\/v1\/auth\/email\/request/);
  assert.match(handler, /\/v1\/auth\/email\/verify/);
  assert.match(handler, /ensureEmailAuthReady/);
  assert.match(app, /<EmailAuthScreen/);
  assert.match(app, /setScreen\('auth-email'\)/);
  assert.doesNotMatch(app, /requestOtp|verifyOtp|auth-phone|auth-code/);
});

test('Vercel production build remains read-only with respect to schema', () => {
  const parsed = JSON.parse(packageJson) as { scripts: Record<string, string> };
  assert.match(parsed.scripts['vercel-build'], /verify-production-db/);
  assert.doesNotMatch(parsed.scripts['vercel-build'], /db:migrate/);
});
