// Explicit environment identity for the Admin Vercel project's server-side API proxy.
//
// NODE_ENV is NOT a safe signal for this: Next.js/Vercel builds run with
// NODE_ENV=production for Production AND Preview deployments alike, so a
// NODE_ENV-only check cannot tell a real Preview Internal Beta deployment
// apart from Production. VERCEL_ENV is the platform-provided signal that
// actually distinguishes them ('production' | 'preview' | 'development'),
// and APP_ENV is an explicit override for cases where VERCEL_ENV is absent
// (local dev, non-Vercel hosting) or must be pinned deliberately.
export type AppEnv = 'production' | 'preview_internal_beta' | 'local';

const KNOWN_APP_ENVS: readonly AppEnv[] = ['production', 'preview_internal_beta', 'local'];

export function resolveAppEnv(): AppEnv {
  const explicit = process.env.APP_ENV?.trim().toLowerCase();
  if (explicit) {
    if ((KNOWN_APP_ENVS as readonly string[]).includes(explicit)) return explicit as AppEnv;
    // Fail closed: an unrecognized APP_ENV value must never be silently treated as safe.
    throw new Error(`APP_ENV has an unrecognized value: "${explicit}". Expected one of: ${KNOWN_APP_ENVS.join(', ')}.`);
  }

  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview_internal_beta';
  return 'local';
}

export function isProductionOrigin(candidate: string, productionBaseUrl: string): boolean {
  try {
    return new URL(candidate).hostname.toLowerCase() === new URL(productionBaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
}
