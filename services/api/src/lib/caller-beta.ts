import { HttpError } from './http.ts';

export function isCallerClosedBetaConfigured(): boolean {
  return process.env.CALLER_CLOSED_BETA_ENABLED?.trim().toLowerCase() === 'true';
}

export function isCommercialHostingApproved(): boolean {
  return process.env.COMMERCIAL_HOSTING_APPROVED?.trim().toLowerCase() === 'true';
}

export function isCallerClosedBetaEnabled(): boolean {
  if (!isCallerClosedBetaConfigured()) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return isCommercialHostingApproved();
}

export function requireCallerClosedBetaEnabled(): void {
  if (!isCallerClosedBetaConfigured()) {
    throw new HttpError(403, 'caller_closed_beta_disabled');
  }
  if (process.env.NODE_ENV === 'production' && !isCommercialHostingApproved()) {
    throw new HttpError(403, 'commercial_hosting_not_approved');
  }
}
