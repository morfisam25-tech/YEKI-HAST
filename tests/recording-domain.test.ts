import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionRecordingState,
  hasBothPartyRecordingConsent,
  isPurgeEligible,
  isRecordingActiveForBilling,
  isRecordingTerminallyFailed,
  LEGAL_HOLD_POST_CLOSURE_REVIEW_DAYS,
  legalHoldReviewDueAt,
  purgeEligibleAt,
  resolveRecordingRequirement,
} from '../packages/domain/src/recording.ts';

test('only a confirmed recording state counts as active for billing', () => {
  assert.equal(isRecordingActiveForBilling('recording'), true);
  assert.equal(isRecordingActiveForBilling('starting'), false);
  assert.equal(isRecordingActiveForBilling('ready'), false);
  assert.equal(isRecordingActiveForBilling('stored'), false);
});

test('recording state machine rejects invalid transitions', () => {
  assert.equal(canTransitionRecordingState('not_requested', 'ready'), true);
  assert.equal(canTransitionRecordingState('not_requested', 'recording'), false);
  assert.equal(canTransitionRecordingState('recording', 'ready'), false);
  assert.equal(canTransitionRecordingState('starting', 'recording'), true);
  assert.equal(canTransitionRecordingState('purged', 'ready'), false);
  assert.equal(canTransitionRecordingState('purged', 'purged'), true);
});

test('failed recording state can be held but never resumes recording directly', () => {
  assert.equal(isRecordingTerminallyFailed('failed'), true);
  assert.equal(canTransitionRecordingState('failed', 'held'), true);
  assert.equal(canTransitionRecordingState('failed', 'recording'), false);
});

test('both-party consent requires an unrevoked row per role at the exact policy version', () => {
  const v = 'rec-2026-09-14';
  assert.equal(hasBothPartyRecordingConsent([
    { role: 'caller', policyVersion: v, revokedAt: null },
    { role: 'listener', policyVersion: v, revokedAt: null },
  ], v), true);
});

test('a caller-only consent is not sufficient', () => {
  const v = 'rec-2026-09-14';
  assert.equal(hasBothPartyRecordingConsent([
    { role: 'caller', policyVersion: v, revokedAt: null },
  ], v), false);
});

test('a stale (wrong policy version) consent does not satisfy the current requirement', () => {
  const current = 'rec-2026-09-14';
  assert.equal(hasBothPartyRecordingConsent([
    { role: 'caller', policyVersion: current, revokedAt: null },
    { role: 'listener', policyVersion: 'rec-2026-01-01', revokedAt: null },
  ], current), false);
});

test('a revoked consent does not satisfy the requirement even at the right version', () => {
  const v = 'rec-2026-09-14';
  assert.equal(hasBothPartyRecordingConsent([
    { role: 'caller', policyVersion: v, revokedAt: null },
    { role: 'listener', policyVersion: v, revokedAt: '2026-09-14T00:00:00.000Z' },
  ], v), false);
});

test('production requires an explicit recordingRequiredFlag=true, not merely non-false', () => {
  assert.throws(() => resolveRecordingRequirement({
    environment: 'production',
    recordingRequiredFlag: null,
    provider: 'cloudflare_realtimekit',
    policyVersion: 'v1',
  }), /must_be_explicitly_true/);
  assert.throws(() => resolveRecordingRequirement({
    environment: 'production',
    recordingRequiredFlag: false,
    provider: 'cloudflare_realtimekit',
    policyVersion: 'v1',
  }), /must_be_explicitly_true/);
});

test('production with required=true but missing provider/policy fails closed', () => {
  assert.throws(() => resolveRecordingRequirement({
    environment: 'production',
    recordingRequiredFlag: true,
    provider: null,
    policyVersion: 'v1',
  }), /not_configured/);
  assert.throws(() => resolveRecordingRequirement({
    environment: 'production',
    recordingRequiredFlag: true,
    provider: 'cloudflare_realtimekit',
    policyVersion: null,
  }), /not_configured/);
});

test('production cannot silently downgrade required recording to OFF via missing config', () => {
  // A production deployment that forgets to set CALL_RECORDING_REQUIRED (or
  // sets it to false, or sets it true without a provider) must fail closed --
  // never fall back to "recording not required".
  for (const flag of [null, false] as const) {
    assert.throws(() => resolveRecordingRequirement({
      environment: 'production',
      recordingRequiredFlag: flag,
      provider: null,
      policyVersion: null,
    }));
  }
});

test('production fully configured resolves to required=true', () => {
  const policy = resolveRecordingRequirement({
    environment: 'production',
    recordingRequiredFlag: true,
    provider: 'cloudflare_realtimekit',
    policyVersion: 'rec-2026-09-14',
  });
  assert.deepEqual(policy, { required: true, provider: 'cloudflare_realtimekit', policyVersion: 'rec-2026-09-14' });
});

test('preview_internal_beta may explicitly disable recording (technical-beta exception)', () => {
  const policy = resolveRecordingRequirement({
    environment: 'preview_internal_beta',
    recordingRequiredFlag: false,
    provider: null,
    policyVersion: null,
  });
  assert.deepEqual(policy, { required: false, provider: null, policyVersion: null });
});

test('preview_internal_beta with the flag unset (not explicitly false) fails closed too', () => {
  assert.throws(() => resolveRecordingRequirement({
    environment: 'preview_internal_beta',
    recordingRequiredFlag: null,
    provider: null,
    policyVersion: null,
  }), /not_configured/);
});

test('preview_internal_beta opting in to required=true must be fully configured or fail closed', () => {
  assert.throws(() => resolveRecordingRequirement({
    environment: 'preview_internal_beta',
    recordingRequiredFlag: true,
    provider: null,
    policyVersion: null,
  }));
});

test('purge eligibility respects legal hold and the retention window', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const eligible = purgeEligibleAt(start, 90);
  assert.equal(eligible.toISOString(), '2026-04-01T00:00:00.000Z');
  assert.equal(isPurgeEligible(new Date('2026-03-01T00:00:00.000Z'), eligible, false), false);
  assert.equal(isPurgeEligible(new Date('2026-05-01T00:00:00.000Z'), eligible, false), true);
  assert.equal(isPurgeEligible(new Date('2026-05-01T00:00:00.000Z'), eligible, true), false);
});

test('legal hold review-due date is 180 days after the case closes, and null while it is still open', () => {
  assert.equal(LEGAL_HOLD_POST_CLOSURE_REVIEW_DAYS, 180);
  assert.equal(legalHoldReviewDueAt(null), null);
  const dueAt = legalHoldReviewDueAt(new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(dueAt?.toISOString(), '2026-06-30T00:00:00.000Z');
});

test('legal hold review-due date rejects a non-positive window instead of silently no-op-ing', () => {
  assert.throws(() => legalHoldReviewDueAt(new Date('2026-01-01T00:00:00.000Z'), 0), /postClosureReviewDays/);
  assert.throws(() => legalHoldReviewDueAt(new Date('2026-01-01T00:00:00.000Z'), -5), /postClosureReviewDays/);
});

// W89: RealtimeKit stops recording itself once the last participant leaves and
// then reports UPLOADING/UPLOADED directly, never passing through a stop we
// issued. The session table previously refused those, pinning the session at
// 'recording' so ended_at / retention_until / purge_eligible_at were never set
// and the recording never became purge-eligible.
test('a provider-initiated stop can settle a recording session without an explicit stopping step', () => {
  assert.equal(canTransitionRecordingState('recording', 'uploading'), true);
  assert.equal(canTransitionRecordingState('recording', 'stored'), true);
  // The explicit-stop path stays valid.
  assert.equal(canTransitionRecordingState('recording', 'stopping'), true);
  assert.equal(canTransitionRecordingState('stopping', 'stored'), true);
  // Settled/terminal states still never reopen into an active recording.
  assert.equal(canTransitionRecordingState('stored', 'recording'), false);
  assert.equal(canTransitionRecordingState('purged', 'recording'), false);
  assert.equal(canTransitionRecordingState('recording', 'ready'), false);
  // Billing confirmation is unchanged: only a confirmed 'recording' counts.
  assert.equal(isRecordingActiveForBilling('recording'), true);
  assert.equal(isRecordingActiveForBilling('uploading'), false);
  assert.equal(isRecordingActiveForBilling('stored'), false);
});
