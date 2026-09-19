// Explicit environment identity for the mobile app's own API origin resolution.
//
// Mirrors apps/web/app/api/_env.ts / apps/admin/app/api/_env.ts (W57's Preview
// Internal Beta architecture) exactly on purpose: mobile has no VERCEL_ENV
// equivalent (EAS builds, not Vercel deployments), so EXPO_PUBLIC_APP_ENV is
// the explicit, EAS-build-profile-supplied signal that plays the same role
// APP_ENV/VERCEL_ENV play for the web/admin Vercel projects. There is no
// implicit default that resolves to 'production' -- an unset or unrecognized
// value must never be silently treated as safe.
// 'closed_test' (W86): the Google Play Closed-Test EAS build profile. It
// resolves its API origin exactly like preview_internal_beta (explicit,
// non-Production origin required, fail-closed otherwise -- see api.ts) but
// is a distinct value so mobile-only, closed-test-only gates (real-money
// payment UI in particular; see isPaymentEnabled() below) can key off it
// without being entangled with the existing internal-beta distribution.
export type AppEnv = 'production' | 'preview_internal_beta' | 'closed_test' | 'local';

const KNOWN_APP_ENVS: readonly AppEnv[] = ['production', 'preview_internal_beta', 'closed_test', 'local'];

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

// W86: the Closed-Test build must never expose a live/real-money payment
// checkout before Google Play payment policy is resolved for this product
// (see MISSION H). This is deliberately a hardcoded, unconditional gate --
// no override flag -- so a Closed-Test build cannot accidentally ship with
// real payment enabled. Production and Preview Internal Beta are unaffected.
export function isPaymentEnabled(): boolean {
  return resolveAppEnv() !== 'closed_test';
}

export function isProductionOrigin(candidate: string, productionBaseUrl: string): boolean {
  try {
    return new URL(candidate).hostname.toLowerCase() === new URL(productionBaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
}
