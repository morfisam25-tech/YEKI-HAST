import { randomBytes } from 'node:crypto';

const TEAM_ID = 'team_GmseY3ibD05FWemVhLElL3hI';
const PROJECT_ID = 'prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy';
const API_ORIGIN = 'https://api.vercel.com';
const DEFAULT_PRIVACY_POLICY_URL = 'https://web-unique-6ff0.vercel.app/privacy';
const DEFAULT_TERMS_OF_SERVICE_URL = 'https://web-unique-6ff0.vercel.app/terms';
const DEFAULT_ACCOUNT_DELETION_URL = 'https://web-unique-6ff0.vercel.app/account/delete';
const DEFAULT_MAILBOX_EMAIL = 'sales@uniqueholding.com.tr';
const DEFAULT_GMAIL_FROM_NAME = 'یکی هست';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (/\r|\n/.test(value)) throw new Error(`${name} contains a line break`);
  return value;
}

function requiredMultiline(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(name, fallback) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (/\r|\n/.test(value)) throw new Error(`${name} contains a line break`);
  return value;
}

function provided(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (/\r|\n/.test(value)) throw new Error(`${name} contains a line break`);
  return value;
}

function requireAbsentOrExact(name, expected, normalize = (value) => value) {
  const value = provided(name);
  if (value === null) return;
  if (normalize(value) !== normalize(expected)) {
    throw new Error(`${name} conflicts with the locked technical-beta configuration`);
  }
}

function validateDatabaseUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('PRODUCTION_DATABASE_URL is not a valid URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('PRODUCTION_DATABASE_URL must be PostgreSQL');
  }
  if (!url.hostname || !url.username || !url.password || url.pathname === '/') {
    throw new Error('PRODUCTION_DATABASE_URL is incomplete');
  }
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error('PRODUCTION_DATABASE_URL must not point to localhost');
  }
}

function pooledRuntimeDatabaseUrl(value) {
  const url = new URL(value);
  if (!url.hostname.endsWith('.us-east-1.aws.neon.tech')) {
    throw new Error('PRODUCTION_DATABASE_URL must use the approved Neon aws-us-east-1 endpoint');
  }
  const labels = url.hostname.split('.');
  if (!labels[0].endsWith('-pooler')) labels[0] = `${labels[0]}-pooler`;
  url.hostname = labels.join('.');
  return url.toString();
}

function validateEmail(value, name = 'email') {
  const parts = value.toLowerCase().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.') || /\s|[\r\n]/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
}

function validateServiceAccountJson(value) {
  let credential;
  try { credential = JSON.parse(value); }
  catch { throw new Error('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON is invalid JSON'); }
  if (!credential || credential.type !== 'service_account') {
    throw new Error('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON must be a service account credential');
  }
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/i.test(String(credential.client_email ?? ''))) {
    throw new Error('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON client email is invalid');
  }
  if (typeof credential.private_key !== 'string' || !credential.private_key.includes('-----BEGIN PRIVATE KEY-----') || !credential.private_key.includes('-----END PRIVATE KEY-----')) {
    throw new Error('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON private key is invalid');
  }
  if ((credential.token_uri ?? GOOGLE_TOKEN_URL) !== GOOGLE_TOKEN_URL) {
    throw new Error('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON token endpoint is invalid');
  }
  if (!/^\d{6,30}$/.test(String(credential.client_id ?? ''))) {
    throw new Error('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON client ID is invalid');
  }
}

function validatePublicHttpsUrl(value, name) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error(`${name} is not a valid URL`); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error(`${name} must be a public HTTPS URL without embedded credentials`);
  }
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error(`${name} must not point to localhost`);
  }
}

function productionTarget(env) {
  return Array.isArray(env?.target) && env.target.includes('production');
}

function randomSecret() {
  return randomBytes(32).toString('base64url');
}

async function vercelJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${required('VERCEL_TOKEN')}`,
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Vercel API request failed with status ${response.status}`);
  return response.json();
}

const releaseSha = required('GITHUB_SHA').toLowerCase();
if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('GITHUB_SHA must be a full commit SHA');

const databaseUrl = required('PRODUCTION_DATABASE_URL');
validateDatabaseUrl(databaseUrl);
// Release/migration guards continue to verify the exact approved direct Neon
// endpoint. Runtime traffic is deliberately routed through the equivalent
// PgBouncer hostname so Vercel instance bursts cannot fan out raw Postgres
// connections. Credentials, database name and query parameters are unchanged.
const runtimeDatabaseUrl = pooledRuntimeDatabaseUrl(databaseUrl);

// Technical beta uses one source-locked Google Workspace identity. The service-account
// credential is accepted only as a raw secret and runtime code can exchange it only at
// Google's fixed OAuth endpoint, then send through the fixed Gmail API endpoint.
const gmailServiceAccountJson = requiredMultiline('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON');
validateServiceAccountJson(gmailServiceAccountJson);
const gmailImpersonatedUser = DEFAULT_MAILBOX_EMAIL;
const gmailFromEmail = DEFAULT_MAILBOX_EMAIL;
const gmailFromName = DEFAULT_GMAIL_FROM_NAME;
validateEmail(gmailImpersonatedUser, 'GMAIL_IMPERSONATED_USER');
validateEmail(gmailFromEmail, 'GMAIL_FROM_EMAIL');

const commercialHostingApproved = optional('PRODUCTION_COMMERCIAL_HOSTING_APPROVED', 'false').toLowerCase();
if (!['true', 'false'].includes(commercialHostingApproved)) {
  throw new Error('PRODUCTION_COMMERCIAL_HOSTING_APPROVED must be true or false');
}

// Public legal routes are checked-in first-party surfaces for this beta. Reject
// stale optional secret overrides instead of allowing API bootstrap to drift from
// the Web release that the frontend workflow actually verifies and publishes.
requireAbsentOrExact('PRODUCTION_PRIVACY_POLICY_URL', DEFAULT_PRIVACY_POLICY_URL);
requireAbsentOrExact('PRODUCTION_TERMS_OF_SERVICE_URL', DEFAULT_TERMS_OF_SERVICE_URL);
requireAbsentOrExact('PRODUCTION_ACCOUNT_DELETION_URL', DEFAULT_ACCOUNT_DELETION_URL);
const privacyPolicyUrl = DEFAULT_PRIVACY_POLICY_URL;
const termsOfServiceUrl = DEFAULT_TERMS_OF_SERVICE_URL;
const accountDeletionUrl = DEFAULT_ACCOUNT_DELETION_URL;
const supportEmail = DEFAULT_MAILBOX_EMAIL;
validatePublicHttpsUrl(privacyPolicyUrl, 'PRIVACY_POLICY_URL');
validatePublicHttpsUrl(termsOfServiceUrl, 'TERMS_OF_SERVICE_URL');
validatePublicHttpsUrl(accountDeletionUrl, 'ACCOUNT_DELETION_URL');
validateEmail(supportEmail, 'SUPPORT_EMAIL');

const listUrl = `${API_ORIGIN}/v10/projects/${PROJECT_ID}/env?teamId=${encodeURIComponent(TEAM_ID)}`;
const listed = await vercelJson(listUrl);
const envs = Array.isArray(listed?.envs) ? listed.envs : [];
const existingProductionKeys = new Set(
  envs.filter(productionTarget).map((env) => env?.key).filter((key) => typeof key === 'string'),
);

const entries = [];
function setPlain(key, value) {
  entries.push({ key, value: String(value), type: 'plain', target: ['production'] });
}
function setSensitive(key, value) {
  entries.push({ key, value: String(value), type: 'sensitive', target: ['production'] });
}

setSensitive('DATABASE_URL', runtimeDatabaseUrl);
// Keep each Vercel runtime instance intentionally small. The Neon PgBouncer
// endpoint supplies the cross-instance pooling layer; local Pool still reuses a
// couple of connections inside a warm instance without creating a connection storm.
setPlain('DB_POOL_MAX', '2');
setPlain('YEKI_HAST_RELEASE_SHA', releaseSha);

setPlain('EMAIL_PROVIDER', 'gmail_api');
setSensitive('GMAIL_SERVICE_ACCOUNT_JSON', gmailServiceAccountJson);
setPlain('GMAIL_IMPERSONATED_USER', gmailImpersonatedUser);
setPlain('GMAIL_FROM_EMAIL', gmailFromEmail);
setPlain('GMAIL_FROM_NAME', gmailFromName);

setPlain('PRIVACY_POLICY_URL', privacyPolicyUrl);
setPlain('TERMS_OF_SERVICE_URL', termsOfServiceUrl);
setPlain('ACCOUNT_DELETION_URL', accountDeletionUrl);
setPlain('SUPPORT_EMAIL', supportEmail);

setPlain('SESSION_TTL_HOURS', '720');
setPlain('OTP_TTL_SECONDS', '300');
setPlain('OTP_PHONE_LIMIT_PER_15M', '5');
setPlain('OTP_EMAIL_LIMIT_PER_15M', '5');
setPlain('OTP_EMAIL_IP_LIMIT_PER_15M', '200');
setPlain('OTP_IP_LIMIT_PER_15M', '20');
setPlain('OTP_GLOBAL_LIMIT_PER_15M', '1000');
setPlain('DEV_EXPOSE_OTP', 'false');

// A normal production sync always returns one-time and provider-gated launch surfaces to safe defaults.
setPlain('BOOTSTRAP_ADMIN_ENABLED', 'false');
setPlain('BOOTSTRAP_ADMIN_PHONE_E164', '');
setPlain('BOOTSTRAP_ADMIN_EMAIL', '');
setPlain('BOOTSTRAP_ADMIN_EXPIRES_AT', '');
setPlain('CALLER_CLOSED_BETA_ENABLED', 'false');
setPlain('COMMERCIAL_HOSTING_APPROVED', commercialHostingApproved);
setPlain('MANUAL_PHONE_VERIFICATION_BETA_ENABLED', 'false');
setPlain('SMS_PROVIDER', '');
setPlain('SMSIR_OTP_TEMPLATE_APPROVED', 'false');
setPlain('PAYMENT_PROVIDER', '');
setPlain('KYC_INQUIRY_PROVIDER', '');
setPlain('PAYOUT_PROVIDER', '');
setPlain('TELEPHONY_PROVIDER', '');
setPlain('DEFAULT_PRODUCT_CODE', 'yeki_hast');
setPlain('DEFAULT_SERVICE_CODE', 'human_listening');
setPlain('DEFAULT_MARKET_CODE', 'ir');

for (const key of [
  'PHONE_HASH_PEPPER',
  'EMAIL_HASH_PEPPER',
  'IP_HASH_PEPPER',
  'OTP_HASH_PEPPER',
  'KYC_HASH_PEPPER',
]) {
  if (!existingProductionKeys.has(key)) setSensitive(key, randomSecret());
}

const hasEncryptionKeyId = existingProductionKeys.has('ACTIVE_DATA_ENCRYPTION_KEY_ID');
const hasEncryptionRing = existingProductionKeys.has('DATA_ENCRYPTION_KEYS');
if (hasEncryptionKeyId !== hasEncryptionRing) {
  throw new Error('Production encryption configuration is partial; refusing to rotate or guess it');
}
if (!hasEncryptionKeyId) {
  const keyId = 'k1';
  const key = randomBytes(32).toString('base64');
  setPlain('ACTIVE_DATA_ENCRYPTION_KEY_ID', keyId);
  setSensitive('DATA_ENCRYPTION_KEYS', JSON.stringify({ [keyId]: key }));
}

const updateUrl = `${API_ORIGIN}/v10/projects/${PROJECT_ID}/env?upsert=true&teamId=${encodeURIComponent(TEAM_ID)}`;
const updated = await vercelJson(updateUrl, { method: 'POST', body: JSON.stringify(entries) });
if (Array.isArray(updated?.failed) && updated.failed.length > 0) {
  throw new Error(`Vercel environment sync reported ${updated.failed.length} failed item(s)`);
}

console.log(`production API environment sync PASS (${entries.length} keys checked/upserted; values hidden)`);
