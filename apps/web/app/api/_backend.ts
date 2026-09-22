import { isProductionOrigin, resolveAppEnv } from './_env.ts';

export const WEB_SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-yeki_web_session' : 'yeki_web_session';
export const PRODUCTION_API_BASE_URL = 'https://yeki-hast-unique-6ff0.vercel.app';
const BACKEND_REQUEST_TIMEOUT_MS = 15_000;

// Environment identity (APP_ENV / VERCEL_ENV), never NODE_ENV alone: Vercel builds
// Preview deployments with NODE_ENV=production too, so a NODE_ENV-only check cannot
// tell Preview apart from Production. Preview must never silently fall back to the
// Production API, so a missing/unsafe Preview API origin fails closed instead of
// defaulting anywhere.
export function backendBaseUrl(): string {
  const env = resolveAppEnv();
  if (env === 'production') return PRODUCTION_API_BASE_URL;

  if (env === 'preview_internal_beta') {
    const configured = process.env.WEB_API_BASE_URL?.trim();
    if (!configured) {
      throw new Error('WEB_API_BASE_URL is required in preview_internal_beta; Preview must never fall back to the Production API');
    }
    const normalized = configured.replace(/\/$/, '');
    if (isProductionOrigin(normalized, PRODUCTION_API_BASE_URL)) {
      throw new Error('WEB_API_BASE_URL must not point at the Production API origin in preview_internal_beta');
    }
    return normalized;
  }

  const configured = process.env.WEB_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return 'http://localhost:4000';
}

export function browserMutationAllowed(request: Request): boolean {
  let requestOrigin: string;
  try { requestOrigin = new URL(request.url).origin; }
  catch { return false; }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== requestOrigin) return false;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false;
  if (origin) return true;
  if (fetchSite === 'same-origin' || fetchSite === 'none') return true;

  // Browser proxy mutations fail closed in production. Metadata-less synthetic
  // requests remain usable in local development and unit tests only.
  return process.env.NODE_ENV !== 'production';
}

export async function backendRequest(path: string, init: RequestInit = {}) {
  return fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS),
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function jsonOrNull(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return null; }
}

export function proxyError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    return String((body as { error: string }).error);
  }
  return fallback;
}
