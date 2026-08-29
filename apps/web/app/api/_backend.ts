export const WEB_SESSION_COOKIE = 'yeki_web_session';
export const PRODUCTION_API_BASE_URL = 'https://yeki-hast-theta.vercel.app';

export function backendBaseUrl(): string {
  const configured = process.env.WEB_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4000';
  return PRODUCTION_API_BASE_URL;
}

export async function backendRequest(path: string, init: RequestInit = {}) {
  return fetch(`${backendBaseUrl()}${path}`, {
    ...init,
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
