import { randomBytes } from 'node:crypto';

const TEAM_ID = 'team_GmseY3ibD05FWemVhLElL3hI';
const PROJECT_ID = 'prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy';
const API_ORIGIN = 'https://api.vercel.com';
const DEFAULT_PRIVACY_POLICY_URL = 'https://web-unique-6ff0.vercel.app/privacy';
const DEFAULT_TERMS_OF_SERVICE_URL = 'https://web-unique-6ff0.vercel.app/terms';
const DEFAULT_ACCOUNT_DELETION_URL = 'https://web-unique-6ff0.vercel.app/account/delete';
const DEFAULT_MAILBOX_EMAIL = 'sales@uniqueholding.com.tr';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (/\r|\n/.test(value)) throw new Error(`${name} contains a line break`);
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

function validateEmail(value, name = 'PRODUCTION_SMTP_FROM_EMAIL') {
  const parts = value.toLowerCase().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.') || /\s|[\r\n]/.test(value)) {
    throw new Error(`${name} is invalid`);
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

// The existing corporate mail domain is on Google Workspace. The verified sales
// mailbox is the production default and can still be overridden explicitly.
const smtpHost = optional('PRODUCTION_SMTP_HOST', 'smtp.gmail.com');
const smtpPort = optional('PRODUCTION_SMTP_PORT', '465');
const smtpSecure = optional('PRODUCTION_SMTP_SECURE', 'true').toLowerCase();
const smtpUsername = optional('PRODUCTION_SMTP_USERNAME', DEFAULT_MAILBOX_EMAIL).toLowerCase();
const smtpPassword = required('PRODUCTION_SMTP_PASSWORD');
const smtpFromEmail = optional('PRODUCTION_SMTP_FROM_EMAIL', smtpUsername).toLowerCase();
const smtpFromName = optional('PRODUCTION_SMTP_FROM_NAME', 'یکی هست').replace(/[\r\n]/g, ' ').slice(0, 80);
const commercialHostingApproved = optional('PRODUCTION_COMMERCIAL_HOSTING_APPROVED', 'false').toLowerCase();

const portNumber = Number(smtpPort);
if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
  throw new Error('PRODUCTION_SMTP_PORT is invalid');
}
if (!['true', 'false'].includes(smtpSecure)) throw new Error('PRODUCTION_SMTP_SECURE must be true or false');
if (!['true', 'false'].includes(commercialHostingApproved)) {
  throw new Error('PRODUCTION_COMMERCIAL_HOSTING_APPROVED must be true or false');
}
validateEmail(smtpUsername, 'PRODUCTION_SMTP_USERNAME');
validateEmail(smtpFromEmail);
if (!smtpHost || !smtpPassword) throw new Error('SMTP configuration is incomplete');

// Privacy, terms and account deletion are first-party Web surfaces checked into
// this repository. Their canonical production URLs are therefore safe defaults.
// The default support mailbox is the same verified bidirectional Workspace route.
const privacyPolicyUrl = provided('PRODUCTION_PRIVACY_POLICY_URL') ?? DEFAULT_PRIVACY_POLICY_URL;
const termsOfServiceUrl = provided('PRODUCTION_TERMS_OF_SERVICE_URL') ?? DEFAULT_TERMS_OF_SERVICE_URL;
const accountDeletionUrl = provided('PRODUCTION_ACCOUNT_DELETION_URL') ?? DEFAULT_ACCOUNT_DELETION_URL;
const supportEmail = optional('PRODUCTION_SUPPORT_EMAIL', DEFAULT_MAILBOX_EMAIL).toLowerCase();
validatePublicHttpsUrl(privacyPolicyUrl, 'PRODUCTION_PRIVACY_POLICY_URL');
validatePublicHttpsUrl(termsOfServiceUrl, 'PRODUCTION_TERMS_OF_SERVICE_URL');
validatePublicHttpsUrl(accountDeletionUrl, 'PRODUCTION_ACCOUNT_DELETION_URL');
validateEmail(supportEmail, 'PRODUCTION_SUPPORT_EMAIL');

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

setSensitive('DATABASE_URL', databaseUrl);
setPlain('DB_POOL_MAX', '10');
setPlain('YEKI_HAST_RELEASE_SHA', releaseSha);

setPlain('EMAIL_PROVIDER', 'smtp');
setPlain('SMTP_HOST', smtpHost);
setPlain('SMTP_PORT', String(portNumber));
setPlain('SMTP_SECURE', smtpSecure);
setSensitive('SMTP_USERNAME', smtpUsername);
setSensitive('SMTP_PASSWORD', smtpPassword);
setPlain('SMTP_FROM_EMAIL', smtpFromEmail);
setPlain('SMTP_FROM_NAME', smtpFromName);

setPlain('PRIVACY_POLICY_URL', privacyPolicyUrl);
setPlain('TERMS_OF_SERVICE_URL', termsOfServiceUrl);
setPlain('ACCOUNT_DELETION_URL', accountDeletionUrl);
setPlain('SUPPORT_EMAIL', supportEmail);

setPlain('SESSION_TTL_HOURS', '720');
setPlain('OTP_TTL_SECONDS', '300');
setPlain('OTP_PHONE_LIMIT_PER_15M', '5');
setPlain('OTP_EMAIL_LIMIT_PER_15M', '5');
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
