import { HttpError } from './http.ts';

export function isCallerClosedBetaEnabled(): boolean {
  return process.env.CALLER_CLOSED_BETA_ENABLED?.trim().toLowerCase() === 'true';
}

export function requireCallerClosedBetaEnabled(): void {
  if (!isCallerClosedBetaEnabled()) {
    throw new HttpError(403, 'caller_closed_beta_disabled');
  }
}
