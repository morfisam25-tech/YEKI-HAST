const MAX_BOOTSTRAP_WINDOW_MS = 30 * 60 * 1000;

export function isAdminBootstrapWindowOpen(nowMs = Date.now()): boolean {
  if (process.env.BOOTSTRAP_ADMIN_ENABLED?.trim().toLowerCase() !== 'true') return false;
  const rawExpiry = process.env.BOOTSTRAP_ADMIN_EXPIRES_AT?.trim();
  if (!rawExpiry) return false;
  const expiresAtMs = Date.parse(rawExpiry);
  if (!Number.isFinite(expiresAtMs)) return false;
  const remainingMs = expiresAtMs - nowMs;
  return remainingMs > 0 && remainingMs <= MAX_BOOTSTRAP_WINDOW_MS;
}
