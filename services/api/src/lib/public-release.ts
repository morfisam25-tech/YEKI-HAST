export type PublicReleaseConfig = {
  ready: boolean;
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  accountDeletionUrl: string | null;
  supportEmail: string | null;
};

function publicHttpsUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function supportEmail(value: string | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw || /\s|[\r\n]/.test(raw)) return null;
  const parts = raw.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.')) return null;
  return raw;
}

export function getPublicReleaseConfig(): PublicReleaseConfig {
  const privacyPolicyUrl = publicHttpsUrl(process.env.PRIVACY_POLICY_URL);
  const termsOfServiceUrl = publicHttpsUrl(process.env.TERMS_OF_SERVICE_URL);
  const accountDeletionUrl = publicHttpsUrl(process.env.ACCOUNT_DELETION_URL);
  const support = supportEmail(process.env.SUPPORT_EMAIL);
  return {
    ready: Boolean(privacyPolicyUrl && termsOfServiceUrl && accountDeletionUrl && support),
    privacyPolicyUrl,
    termsOfServiceUrl,
    accountDeletionUrl,
    supportEmail: support,
  };
}
