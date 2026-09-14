// Explicit environment identity for the mobile app's own API origin resolution.
//
// Mirrors apps/web/app/api/_env.ts / apps/admin/app/api/_env.ts (W57's Preview
// Internal Beta architecture) exactly on purpose: mobile has no VERCEL_ENV
// equivalent (EAS builds, not Vercel deployments), so EXPO_PUBLIC_APP_ENV is
// the explicit, EAS-build-profile-supplied signal that plays the same role
// APP_ENV/VERCEL_ENV play for the web/admin Vercel projects. There is no
// implicit default that resolves to 'production' -- an unset or unrecognized
// value must never be silently treated as safe.
export type AppEnv = 'production' | 'preview_internal_beta' | 'local';

const KNOWN_APP_ENVS: readonly AppEnv[] = ['production', 'preview_internal_beta', 'local'];

export function resolveAppEnv(): AppEnv {
  const explicit = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (explicit) {
    if ((KNOWN_APP_ENVS as readonly string[]).includes(explicit)) return explicit as AppEnv;
    // Fail closed: an unrecognized EXPO_PUBLIC_APP_ENV value must never be silently treated as safe.
    throw new Error(`EXPO_PUBLIC_APP_ENV has an unrecognized value: "${explicit}". Expected one of: ${KNOWN_APP_ENVS.join(', ')}.`);
  }
  // No EAS build profile sets EXPO_PUBLIC_APP_ENV (e.g. a bare `expo start` in
  // local development) -- treat as local, exactly like web/admin's unset-VERCEL_ENV case.
  return 'local';
}

export function isProductionOrigin(candidate: string, productionBaseUrl: string): boolean {
  try {
    return new URL(candidate).hostname.toLowerCase() === new URL(productionBaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
}
