import { HttpError } from './http.ts';

export const INTERNAL_OWNER_TEST_LISTENER_ID = '00000000-0000-4000-8000-000000000141';
export const INTERNAL_OWNER_TEST_CALLER_ID = '00000000-0000-4000-8000-000000000142';

let runtimeHydrated = false;

function hydrateInternalBetaRuntime(): void {
  if (runtimeHydrated) return;
  const encoded = process.env.INTERNAL_BETA_RUNTIME_ENV_B64?.trim();
  if (!encoded) return;
  const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>;
  for (const [name, value] of Object.entries(parsed)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name.startsWith('VERCEL_') || name.startsWith('INTERNAL_BETA_')) continue;
    if (typeof value === 'string') process.env[name] = value;
  }
  for (let pass = 0; pass < 3; pass += 1) {
    for (const name of Object.keys(parsed)) {
      const current = process.env[name];
      if (!current) continue;
      process.env[name] = current.replace(/\\?\$\{?([A-Z][A-Z0-9_]*)\}?/g, (whole, reference: string) => process.env[reference] ?? whole);
    }
  }
  const databaseNames = ['DATABASE_URL', ...Object.keys(parsed).filter((name) => /(?:POSTGRES|NEON|DATABASE).*URL/.test(name))];
  for (const name of [...new Set(databaseNames)]) {
    let candidate = process.env[name]?.trim();
    if (!candidate) continue;
    if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))) {
      candidate = candidate.slice(1, -1);
    }
    try {
      const url = new URL(candidate);
      if (url.protocol === 'postgres:' || url.protocol === 'postgresql:') {
        process.env.DATABASE_URL = candidate;
        break;
      }
    } catch { /* try the next production database alias */ }
  }
  runtimeHydrated = true;
}

export function isInternalOwnerTestMode(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return false;
  if (process.env.INTERNAL_BETA_OWNER_TEST_MODE?.trim() !== '1') return false;
  const allowed = vercelEnv === 'preview' || vercelEnv === 'development'
    || process.env.NODE_ENV !== 'production'
    || process.env.INTERNAL_BETA_ENVIRONMENT?.trim() === '1';
  if (allowed) hydrateInternalBetaRuntime();
  return allowed;
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
