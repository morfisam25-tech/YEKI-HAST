import { allRequiredKycChecksVerified, type KycCheckKind, type KycCheckStatus } from './kyc-verification.ts';

// Reuse the existing public Terms version as the evidence version for the
// already-defined `listener_rules` consent type. W87 intentionally does not
// invent a new legal agreement document or wording.
export const LISTENER_RULES_CONSENT_VERSION = 'terms-2026-09-13';

export const WORK_ELIGIBLE_LISTENER_APPLICATION_STATUSES = ['approved', 'active'] as const;

export function isWorkEligibleListenerApplicationStatus(status: string): boolean {
  return (WORK_ELIGIBLE_LISTENER_APPLICATION_STATUSES as readonly string[]).includes(status);
}

export function listenerKycChecksComplete(
  checks: ReadonlyArray<{ checkKind: KycCheckKind; status: KycCheckStatus }>,
): boolean {
  return allRequiredKycChecksVerified(checks);
}
