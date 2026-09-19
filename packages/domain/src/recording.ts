export type RecordingState =
  | 'not_requested'
  | 'consent_pending'
  | 'ready'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'stored'
  | 'failed'
  | 'held'
  | 'purged';

export type CallParty = 'caller' | 'listener';

// Server-authoritative state machine. Every edge here is a transition the
// orchestrator is allowed to make; anything else is rejected as a conflict
// rather than silently accepted. `held` can be entered from (and exited back
// to) most post-recording states because a safety case can be opened at any
// point after a recording exists; it never re-enters the pre-recording states.
const RECORDING_TRANSITIONS: Record<RecordingState, readonly RecordingState[]> = {
  not_requested: ['consent_pending', 'ready'],
  consent_pending: ['consent_pending', 'ready', 'failed'],
  ready: ['starting', 'failed'],
  starting: ['starting', 'recording', 'failed'],
  recording: ['recording', 'stopping', 'failed'],
  stopping: ['stopping', 'uploading', 'stored', 'failed'],
  uploading: ['uploading', 'stored', 'failed'],
  stored: ['stored', 'held', 'purged'],
  failed: ['failed', 'held'],
  held: ['held', 'stored', 'failed', 'purged'],
  purged: ['purged'],
};

export function canTransitionRecordingState(from: RecordingState, to: RecordingState): boolean {
  if (from === to) return RECORDING_TRANSITIONS[from].includes(to);
  return RECORDING_TRANSITIONS[from].includes(to);
}

// Only a confirmed `recording` state counts as an ACTIVE recording. `starting`
// means the provider accepted the request (e.g. HTTP 200 / INVOKED) but has
// not yet confirmed media is actually being captured -- that alone must never
// be treated as authoritative confirmation for billing purposes.
export function isRecordingActiveForBilling(state: RecordingState): boolean {
  return state === 'recording';
}

export function isRecordingTerminallyFailed(state: RecordingState): boolean {
  return state === 'failed';
}

export function isRecordingSettled(state: RecordingState): boolean {
  return state === 'stored' || state === 'held' || state === 'purged';
}

export interface RecordingConsentRecord {
  role: CallParty;
  policyVersion: string;
  revokedAt: string | null;
}

// Both caller and listener must have an unrevoked consent row matching the
// exact policy version currently in force. A caller consent under an old
// policy version does not satisfy a call created after the policy changed.
export function hasBothPartyRecordingConsent(
  consents: readonly RecordingConsentRecord[],
  requiredPolicyVersion: string,
): boolean {
  const valid = new Set(
    consents
      .filter((consent) => consent.revokedAt === null && consent.policyVersion === requiredPolicyVersion)
      .map((consent) => consent.role),
  );
  return valid.has('caller') && valid.has('listener');
}

export interface RecordingPolicy {
  required: boolean;
  provider: string | null;
  policyVersion: string | null;
}

// Fail-closed policy resolution as a pure function of already-parsed env
// values, so it can be unit tested without touching process.env directly.
// See services/api/src/lib/recording-config.ts for the process.env reader.
export function resolveRecordingRequirement(input: {
  environment: 'production' | 'preview_internal_beta' | 'local';
  recordingRequiredFlag: boolean | null;
  provider: string | null;
  policyVersion: string | null;
}): RecordingPolicy {
  if (input.environment === 'production') {
    // Production must never silently downgrade required recording to OFF:
    // an explicit `false` or a missing flag are both rejected the same way
    // recording_required=true would be -- production only accepts an
    // explicit, fully-configured `true`.
    if (input.recordingRequiredFlag !== true) {
      throw new Error('recording_required_must_be_explicitly_true_in_production');
    }
    if (!input.provider || !input.policyVersion) {
      throw new Error('recording_provider_or_policy_version_not_configured');
    }
    return { required: true, provider: input.provider, policyVersion: input.policyVersion };
  }

  // Preview/local: recording may be explicitly disabled (the pre-W54/W60
  // technical-beta exception). Anything other than an explicit `false` is
  // treated as "recording is required here too" and goes through the same
  // fully-configured check as production, so a Preview environment that
  // *does* opt in cannot silently run half-configured.
  if (input.recordingRequiredFlag === false) {
    return { required: false, provider: null, policyVersion: null };
  }
  if (input.recordingRequiredFlag !== true) {
    throw new Error('recording_required_not_configured');
  }
  if (!input.provider || !input.policyVersion) {
    throw new Error('recording_provider_or_policy_version_not_configured');
  }
  return { required: true, provider: input.provider, policyVersion: input.policyVersion };
}

export function purgeEligibleAt(referenceDate: Date, retentionDays: number): Date {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('retentionDays must be a positive number');
  }
  return new Date(referenceDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export function isPurgeEligible(now: Date, eligibleAt: Date | null, legalHold: boolean): boolean {
  if (legalHold) return false;
  if (!eligibleAt) return false;
  return now.getTime() >= eligibleAt.getTime();
}

// W81A: locked policy (see tests/recording-config.test.ts) is that a legal
// hold tied to a safety/complaint case may stay active through the case's
// full lifecycle, then for up to this many more days after the case's final
// closure -- not indefinitely. This computes only a review-due date for
// admin visibility (surfaced in getRecordingForSafetyCase, apps/admin/app/
// recordings/page.tsx); nothing in this codebase reads it to auto-release a
// hold. Release stays an explicit, audited admin action (see
// services/api/src/routes/admin-recording.ts releaseRecordingHold) because no
// case-lifecycle scheduler/sweep exists in this repo to drive an automatic
// one, and inventing one is out of scope here.
export const LEGAL_HOLD_POST_CLOSURE_REVIEW_DAYS = 180;

export function legalHoldReviewDueAt(
  caseResolvedAt: Date | null,
  postClosureReviewDays: number = LEGAL_HOLD_POST_CLOSURE_REVIEW_DAYS,
): Date | null {
  if (!caseResolvedAt) return null;
  if (!Number.isFinite(postClosureReviewDays) || postClosureReviewDays <= 0) {
    throw new Error('postClosureReviewDays must be a positive number');
  }
  return new Date(caseResolvedAt.getTime() + postClosureReviewDays * 24 * 60 * 60 * 1000);
}
