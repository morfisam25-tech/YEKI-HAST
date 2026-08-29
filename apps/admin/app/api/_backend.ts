export const ADMIN_SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-yeki_admin_session' : 'yeki_admin_session';
export const PRODUCTION_API_BASE_URL = 'https://yeki-hast-theta.vercel.app';
const BACKEND_REQUEST_TIMEOUT_MS = 15_000;

export function backendBaseUrl(): string {
  const configured = process.env.ADMIN_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4000';
  return PRODUCTION_API_BASE_URL;
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

  // Admin browser mutations have no legitimate metadata-less production path.
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
