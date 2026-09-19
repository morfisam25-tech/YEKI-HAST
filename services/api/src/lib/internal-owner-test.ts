import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { HttpError } from './http.ts';

export const INTERNAL_OWNER_TEST_LISTENER_ID = '00000000-0000-4000-8000-000000000141';
export const INTERNAL_OWNER_TEST_CALLER_ID = '00000000-0000-4000-8000-000000000142';

const OWNER_TEST_AUTH_HEADER = 'x-internal-beta-owner-test-token';
const MIN_OWNER_TEST_AUTH_TOKEN_LENGTH = 32;

function parseDatabaseUrl(name: string, rawValue: string | undefined): { raw: string; url: URL } {
  const raw = rawValue?.trim();
  if (!raw) throw new HttpError(503, `${name.toLowerCase()}_required`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(503, `${name.toLowerCase()}_invalid`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new HttpError(503, `${name.toLowerCase()}_invalid`);
  }
  return { raw, url };
}

function databaseIdentity(url: URL): string {
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${url.hostname}${port}${url.pathname}`;
}

function isLocalDatabase(url: URL): boolean {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
}

// initializeInternalBetaRuntime() below re-points process.env.DATABASE_URL at
// the dedicated isolated database on every successful call, and
// isInternalOwnerTestMode() is designed to be called many times per request
// (see services/api/src/lib/env.ts#validateDatabaseEnv) and across warm
// serverless invocations of the same process. Without this memo, the
// DATABASE_URL-equality check below would deterministically self-trip on the
// second call onward: DATABASE_URL now equals INTERNAL_BETA_DATABASE_URL
// because THIS module set it that way a moment ago, not because of any real
// misconfiguration. Keyed by the dedicated URL itself (not a bare boolean) so
// a change in INTERNAL_BETA_DATABASE_URL is still re-verified, and so this
// cannot mask a case where DATABASE_URL was equal to the dedicated URL
// before this module ever ran (that still throws on the first call, exactly
// as tests/internal-owner-test-mode.test.ts's isolation tests require).
const selfInitializedDedicatedDatabaseUrls = new Set<string>();

function requireDedicatedInternalBetaDatabase(): string {
  const dedicated = parseDatabaseUrl('INTERNAL_BETA_DATABASE_URL', process.env.INTERNAL_BETA_DATABASE_URL);
  const production = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (production) {
    const parsedProduction = parseDatabaseUrl('PRODUCTION_DATABASE_URL', production);
    if (databaseIdentity(parsedProduction.url) === databaseIdentity(dedicated.url)) {
      throw new HttpError(503, 'internal_beta_database_must_be_isolated');
    }
  }

  const normal = process.env.DATABASE_URL?.trim();
  if (normal && !selfInitializedDedicatedDatabaseUrls.has(dedicated.raw)) {
    const parsedNormal = parseDatabaseUrl('DATABASE_URL', normal);
    if (!isLocalDatabase(dedicated.url)
      && databaseIdentity(parsedNormal.url) === databaseIdentity(dedicated.url)) {
      throw new HttpError(503, 'internal_beta_database_must_be_isolated');
    }
  }
  selfInitializedDedicatedDatabaseUrls.add(dedicated.raw);
  return dedicated.raw;
}

function requireOwnerTestAuthToken(): string {
  const token = process.env.INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN?.trim();
  if (!token || token.length < MIN_OWNER_TEST_AUTH_TOKEN_LENGTH) {
    throw new HttpError(503, 'internal_beta_owner_test_auth_required');
  }
  return token;
}

function initializeInternalBetaRuntime(): void {
  const dedicatedDatabaseUrl = requireDedicatedInternalBetaDatabase();
  requireOwnerTestAuthToken();
  process.env.DATABASE_URL = dedicatedDatabaseUrl;
}

export function isInternalOwnerTestMode(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return false;
  if (process.env.INTERNAL_BETA_OWNER_TEST_MODE?.trim() !== '1') return false;

  const allowed = vercelEnv === 'preview'
    || vercelEnv === 'development'
    || process.env.NODE_ENV?.trim().toLowerCase() === 'development'
    || process.env.INTERNAL_BETA_ENVIRONMENT?.trim() === '1';
  if (!allowed) return false;

  initializeInternalBetaRuntime();
  return true;
}

export function requireInternalOwnerTestMode(): void {
  if (!isInternalOwnerTestMode()) throw new HttpError(404, 'not_found');
}

function digestToken(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function requireInternalOwnerTestAuthorization(req: IncomingMessage): void {
  requireInternalOwnerTestMode();
  const expected = requireOwnerTestAuthToken();
  const header = req.headers[OWNER_TEST_AUTH_HEADER];
  const supplied = Array.isArray(header) ? '' : header?.trim() ?? '';
  if (!supplied || !timingSafeEqual(digestToken(supplied), digestToken(expected))) {
    throw new HttpError(401, 'internal_test_unauthorized');
  }
}

export function isInternalOwnerTestListener(userId: string): boolean {
  return isInternalOwnerTestMode() && userId === INTERNAL_OWNER_TEST_LISTENER_ID;
}

export function isInternalOwnerTestCaller(userId: string): boolean {
  return isInternalOwnerTestMode() && userId === INTERNAL_OWNER_TEST_CALLER_ID;
}
