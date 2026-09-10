import { HttpError } from './http.ts';

export const INTERNAL_OWNER_TEST_LISTENER_ID = '00000000-0000-4000-8000-000000000141';
export const INTERNAL_OWNER_TEST_CALLER_ID = '00000000-0000-4000-8000-000000000142';

export function isInternalOwnerTestMode(): boolean {
  if (process.env.INTERNAL_BETA_OWNER_TEST_MODE?.trim() !== '1') return false;
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return false;
  if (vercelEnv === 'preview' || vercelEnv === 'development') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.INTERNAL_BETA_ENVIRONMENT?.trim() === '1';
}

export function requireInternalOwnerTestMode(): void {
  if (!isInternalOwnerTestMode()) throw new HttpError(404, 'not_found');
}

export function isInternalOwnerTestListener(userId: string): boolean {
  return isInternalOwnerTestMode() && userId === INTERNAL_OWNER_TEST_LISTENER_ID;
}

export function isInternalOwnerTestCaller(userId: string): boolean {
  return isInternalOwnerTestMode() && userId === INTERNAL_OWNER_TEST_CALLER_ID;
}
