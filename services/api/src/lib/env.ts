import { validateSecurityEnv } from './security.ts';

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is invalid`);
  return value;
}

function validateNodeEnv(): void {
  const nodeEnv = requireValue('NODE_ENV');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
}

export function validateDatabaseEnv(): void {
  validateNodeEnv();
  requireValue('DATABASE_URL');
}

export function validateOtpEnv(): void {
  validateDatabaseEnv();
  validateSecurityEnv();
  requireInteger('SESSION_TTL_HOURS', 720, 1, 8760);
  requireInteger('OTP_TTL_SECONDS', 300, 60, 1800);
  requireInteger('OTP_PHONE_LIMIT_PER_15M', 5, 1, 100);
  requireInteger('OTP_IP_LIMIT_PER_15M', 20, 1, 1000);
  requireInteger('OTP_GLOBAL_LIMIT_PER_15M', 1000, 1, 1_000_000);
}
