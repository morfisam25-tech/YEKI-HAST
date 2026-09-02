import { randomUUID, sign } from 'node:crypto';

export interface SendLoginCodeInput {
  email: string;
  code: string;
  ttlSeconds: number;
}

export interface EmailProvider {
  sendLoginCode(input: SendLoginCodeInput): Promise<void>;
}

type ServiceAccountCredential = {
  type: 'service_account';
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type GmailApiConfig = {
  credential: ServiceAccountCredential;
  impersonatedUser: string;
  fromEmail: string;
  fromName: string;
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const PRODUCTION_MAILBOX = 'sales@uniqueholding.com.tr';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function normalizeEmailAddress(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) throw new Error('invalid_email');
  if (/\s|[\r\n]/.test(email)) throw new Error('invalid_email');
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.')) throw new Error('invalid_email');
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0])) throw new Error('invalid_email');
  if (!/^[a-z0-9.-]+$/i.test(parts[1]) || parts[1].startsWith('.') || parts[1].endsWith('.')) {
    throw new Error('invalid_email');
  }
  return email;
}

function parseServiceAccount(raw: string): ServiceAccountCredential {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('GMAIL_SERVICE_ACCOUNT_JSON is invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GMAIL_SERVICE_ACCOUNT_JSON is invalid');
  }
  const credential = parsed as Record<string, unknown>;
  if (credential.type !== 'service_account') throw new Error('GMAIL_SERVICE_ACCOUNT_JSON type is invalid');
  const clientEmail = typeof credential.client_email === 'string' ? credential.client_email.trim() : '';
  const privateKey = typeof credential.private_key === 'string' ? credential.private_key : '';
  const tokenUri = typeof credential.token_uri === 'string' ? credential.token_uri.trim() : GOOGLE_TOKEN_URL;
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/i.test(clientEmail)) {
    throw new Error('GMAIL_SERVICE_ACCOUNT_JSON client email is invalid');
  }
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('GMAIL_SERVICE_ACCOUNT_JSON private key is invalid');
  }
  if (tokenUri !== GOOGLE_TOKEN_URL) throw new Error('GMAIL_SERVICE_ACCOUNT_JSON token endpoint is invalid');
  return {
    type: 'service_account',
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: GOOGLE_TOKEN_URL,
  };
}

function gmailApiConfig(): GmailApiConfig {
  const credential = parseServiceAccount(required('GMAIL_SERVICE_ACCOUNT_JSON'));
  const impersonatedUser = normalizeEmailAddress(required('GMAIL_IMPERSONATED_USER'));
  const fromEmail = normalizeEmailAddress(required('GMAIL_FROM_EMAIL'));
  const fromName = (process.env.GMAIL_FROM_NAME?.trim() || 'Yeki Hast').replace(/[\r\n]/g, ' ').slice(0, 80);
  if (process.env.NODE_ENV === 'production') {
    if (impersonatedUser !== PRODUCTION_MAILBOX || fromEmail !== PRODUCTION_MAILBOX) {
      throw new Error('production Gmail identity is not approved');
    }
  }
  return { credential, impersonatedUser, fromEmail, fromName };
}

export function validateEmailProviderEnv(): void {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  if (!provider) throw new Error('EMAIL_PROVIDER is required');
  if (provider === 'dev') {
    if (process.env.NODE_ENV === 'production') throw new Error('dev email provider is forbidden in production');
    return;
  }
  if (provider === 'gmail_api') {
    gmailApiConfig();
    return;
  }
  throw new Error(`Email provider not implemented: ${provider}`);
}

function encodedHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function encodeJwtPart(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

async function mintDelegatedAccessToken(
  credential: ServiceAccountCredential,
  subject: string,
  scope: string,
): Promise<string> {
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
  let signature: string;
  try {
    signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), credential.private_key).toString('base64url');
  } catch {
    throw new Error('gmail_service_account_signing_failed');
  }
  const assertion = `${signingInput}.${signature}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`gmail_oauth_failed_${response.status}`);
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('gmail_oauth_invalid_response'); }
  const accessToken = (payload as { access_token?: unknown } | null)?.access_token;
  if (typeof accessToken !== 'string' || accessToken.length < 20) {
    throw new Error('gmail_oauth_invalid_response');
  }
  return accessToken;
}

function buildLoginMessage(config: GmailApiConfig, recipient: string, input: SendLoginCodeInput): string {
  const minutes = Math.max(1, Math.ceil(input.ttlSeconds / 60));
  const subject = encodedHeader('کد ورود یکی هست');
  const fromName = encodedHeader(config.fromName);
  const body = [
    `کد ورود شما: ${input.code}`,
    '',
    `این کد تا ${minutes} دقیقه معتبر است.`,
    'اگر این درخواست را شما انجام نداده‌اید، این ایمیل را نادیده بگیرید.',
  ].join('\r\n');
  const messageIdDomain = config.fromEmail.split('@')[1];
  return [
    `From: ${fromName} <${config.fromEmail}>`,
    `To: <${recipient}>`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${messageIdDomain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
}

class GmailApiEmailProvider implements EmailProvider {
  private readonly config: GmailApiConfig;

  constructor(config: GmailApiConfig) {
    this.config = config;
  }

  async sendLoginCode(input: SendLoginCodeInput): Promise<void> {
    const recipient = normalizeEmailAddress(input.email);
    const token = await mintDelegatedAccessToken(
      this.config.credential,
      this.config.impersonatedUser,
      GMAIL_SEND_SCOPE,
    );
    const raw = Buffer.from(buildLoginMessage(this.config, recipient, input), 'utf8').toString('base64url');
    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`gmail_send_failed_${response.status}`);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new Error('gmail_send_invalid_response'); }
    if (typeof (payload as { id?: unknown } | null)?.id !== 'string') {
      throw new Error('gmail_send_invalid_response');
    }
  }
}

class DevEmailProvider implements EmailProvider {
  async sendLoginCode(): Promise<void> {
    // Local development exposes the code only through the guarded API response.
  }
}

export function getEmailProvider(): EmailProvider {
  validateEmailProviderEnv();
  const provider = process.env.EMAIL_PROVIDER?.trim();
  if (provider === 'dev') return new DevEmailProvider();
  if (provider === 'gmail_api') return new GmailApiEmailProvider(gmailApiConfig());
  throw new Error(`Email provider not implemented: ${provider}`);
}
