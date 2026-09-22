export type KycCheckKind = 'national_id_dob_match' | 'iban_inquiry';
export type KycCheckStatus = 'not_checked' | 'pending' | 'verified' | 'failed' | 'error';

// The only two field-level checks the currently captured listener_kyc data
// (national id, date of birth, IBAN) can actually support end to end today.
// A phone/national-id match ("shahkar") is explicitly NOT in this list: the
// Listener KYC submission never collects a phone number, and inventing that
// collection step is a new product requirement, not a bug fix -- flagged
// separately rather than silently skipped or faked.
export const REQUIRED_KYC_CHECKS: readonly KycCheckKind[] = ['national_id_dob_match', 'iban_inquiry'];

export function allRequiredKycChecksVerified(
  checks: ReadonlyArray<{ checkKind: KycCheckKind; status: KycCheckStatus }>,
): boolean {
  return REQUIRED_KYC_CHECKS.every((kind) => checks.some((check) => check.checkKind === kind && check.status === 'verified'));
}

// A single verified field check is never sufficient on its own -- this exists
// so call sites cannot accidentally treat "one check passed" as "identity
// verified" the way a bare aggregate boolean would invite.
export function anyRequiredKycCheckFailed(
  checks: ReadonlyArray<{ checkKind: KycCheckKind; status: KycCheckStatus }>,
): boolean {
  return REQUIRED_KYC_CHECKS.some((kind) => checks.some((check) => check.checkKind === kind && check.status === 'failed'));
}
