export const ADMIN_SESSION_COOKIE = 'yeki_admin_session';

export function backendBaseUrl(): string {
  return (process.env.ADMIN_API_BASE_URL ?? 'https://yeki-hast.vercel.app').replace(/\/$/, '');
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
