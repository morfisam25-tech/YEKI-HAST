import { sign } from 'node:crypto';

const DEFAULT_MAILBOX_EMAIL = 'sales@uniqueholding.com.tr';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizedEmail(value) {
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]?.includes('.') || /\s|[\r\n]/.test(email)) {
    throw new Error('production Gmail mailbox identity is invalid');
  }
  return email;
}

function parseServiceAccount(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON is invalid'); }
  if (!parsed || parsed.type !== 'service_account') throw new Error('production Gmail service account type is invalid');
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/i.test(String(parsed.client_email ?? ''))) {
    throw new Error('production Gmail service account client email is invalid');
  }
  if (typeof parsed.private_key !== 'string' || !parsed.private_key.includes('-----BEGIN PRIVATE KEY-----') || !parsed.private_key.includes('-----END PRIVATE KEY-----')) {
    throw new Error('production Gmail service account private key is invalid');
  }
  if ((parsed.token_uri ?? GOOGLE_TOKEN_URL) !== GOOGLE_TOKEN_URL) {
    throw new Error('production Gmail service account token endpoint is invalid');
  }
  return parsed;
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

async function delegatedAccessToken(credential, subject, scope) {
  const now = Math.floor(Date.now() / 1000);
  const signingInput = [
    encodeJwtPart({ alg: 'RS256', typ: 'JWT' }),
    encodeJwtPart({
      iss: credential.client_email,
      sub: subject,
      scope,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  ].join('.');
  let signature;
  try {
    signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), credential.private_key).toString('base64url');
  } catch {
    throw new Error('production Gmail service account signing failed');
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${signingInput}.${signature}`,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`production Gmail OAuth failed (${response.status})`);
  const payload = await response.json().catch(() => null);
  if (typeof payload?.access_token !== 'string' || payload.access_token.length < 20) {
    throw new Error('production Gmail OAuth returned an invalid response');
  }
  return payload.access_token;
}

async function gmailJson(token, path) {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`production Gmail read failed (${response.status})`);
  return response.json();
}

function decodeRawMessage(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  try { return Buffer.from(raw, 'base64url').toString('utf8'); }
  catch { return ''; }
}

function extractFreshOtp(rawMessage, email, startedAt) {
  const lower = rawMessage.toLowerCase();
  if (!lower.includes(`to: <${email}>`) && !lower.includes(`to: ${email}`)) return null;
  const dateHeader = rawMessage.match(/^Date:\s*(.+)$/mi)?.[1]?.trim();
  const messageTime = dateHeader ? Date.parse(dateHeader) : NaN;
  if (!Number.isFinite(messageTime) || messageTime < startedAt - 30_000) return null;
  return rawMessage.match(/کد ورود شما:\s*(\d{6})/)?.[1] ?? null;
}

async function waitForOtp(token, email, startedAt) {
  const query = encodeURIComponent(`to:${email} newer_than:1d`);
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const listed = await gmailJson(token, `/messages?labelIds=INBOX&maxResults=25&q=${query}`);
    const messages = Array.isArray(listed?.messages) ? listed.messages : [];
    for (const message of messages.slice(0, 25)) {
      const id = typeof message?.id === 'string' ? message.id : '';
      if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
      const detail = await gmailJson(token, `/messages/${encodeURIComponent(id)}?format=raw`);
      const code = extractFreshOtp(decodeRawMessage(detail?.raw), email, startedAt);
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error('fresh production OTP email was not observed in the Gmail inbox');
}

async function jsonRequest(url, init, expectedStatus) {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  let body = null;
  try { body = await response.json(); } catch {}
  if (response.status !== expectedStatus) {
    throw new Error(`production auth request failed with status ${response.status}`);
  }
  return body;
}

const base = required('API_PRODUCTION_URL').replace(/\/$/, '');
if (!base.startsWith('https://')) throw new Error('API_PRODUCTION_URL must use HTTPS');
const email = normalizedEmail(DEFAULT_MAILBOX_EMAIL);
const credential = parseServiceAccount(required('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON'));
const gmailToken = await delegatedAccessToken(credential, email, GMAIL_READ_SCOPE);
const startedAt = Date.now();

await jsonRequest(`${base}/v1/auth/email/request`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email }),
}, 202);

let code = await waitForOtp(gmailToken, email, startedAt);

const verified = await jsonRequest(`${base}/v1/auth/email/verify`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, code }),
}, 200);

const token = typeof verified?.token === 'string' ? verified.token : '';
if (!token || verified?.authMethod !== 'email_otp') throw new Error('production email verify returned an invalid session');

const session = await jsonRequest(`${base}/v1/auth/session`, {
  method: 'GET',
  headers: { authorization: `Bearer ${token}` },
}, 200);
if (session?.ok !== true || typeof session?.userId !== 'string') throw new Error('production session smoke failed');

await jsonRequest(`${base}/v1/auth/logout`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
}, 200);

const revoked = await fetch(`${base}/v1/auth/session`, {
  method: 'GET',
  headers: { authorization: `Bearer ${token}` },
  cache: 'no-store',
});
if (revoked.status !== 401) throw new Error(`revoked production session remained usable (${revoked.status})`);

code = undefined;
console.log('production Email OTP delivery + verify + session + logout E2E PASS (secrets hidden)');
