import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('W87 Listener approval routes are server-owned and audited', () => {
  const handler = source('services/api/src/handler.ts');
  const agreement = source('services/api/src/routes/listener.ts');
  const approval = source('services/api/src/routes/admin-listener-approval.ts');
  const kyc = source('services/api/src/services/kyc-verification.ts');
  const listenerWebProxy = source('apps/web/app/api/listener/[...path]/route.ts');

  assert.match(handler, /POST' && url\.pathname === '\/v1\/listener\/agreement'/);
  assert.match(handler, /adminListenerDecisionMatch/);
  assert.match(handler, /decideListenerApplication/);

  assert.match(agreement, /requireAuth\(req\)/);
  assert.match(agreement, /consent_type='listener_rules'/);
  assert.match(agreement, /LISTENER_RULES_CONSENT_VERSION/);
  assert.match(agreement, /listenerKycChecksComplete/);
  assert.match(agreement, /SET status='admin_review'/);
  assert.doesNotMatch(agreement, /listener_application_approved/);
  assert.doesNotMatch(agreement, /INSERT INTO app\.listener_profiles/);
  assert.doesNotMatch(listenerWebProxy, /listener\\\/.*decision/,
    'the ordinary Listener browser proxy must not expose the Admin decision route');

  assert.match(kyc, /allRequiredKycChecksVerified/);
  assert.match(kyc, /SET status='agreement_pending'/);
  assert.match(kyc, /listener_kyc_ready_for_agreement/);

  assert.match(approval, /requireAdmin\(req\)/);
  assert.match(approval, /FOR UPDATE OF la/);
  assert.match(approval, /listenerKycChecksComplete/);
  assert.match(approval, /consent_type='listener_rules'/);
  assert.match(approval, /a\.result='passed'/);
  assert.match(approval, /listener_rejection_reason_required/);
  assert.match(approval, /INSERT INTO app\.listener_profiles/);
  assert.match(approval, /INSERT INTO app\.listener_service_profiles/);
  assert.match(approval, /INSERT INTO app\.listener_languages/);
  assert.match(approval, /listener_application_approved/);
  assert.match(approval, /listener_application_rejected/);
  assert.match(approval, /status === 'approved' \|\| application\.status === 'active'/);
  assert.match(approval, /idempotent: true/);
  assert.doesNotMatch(approval, /mock_call/, 'mock_call is a reserved state, not an invented launch prerequisite');
});

test('W87 public marketplace exposes only approved work-eligible listeners without generic identity claim', () => {
  const discovery = source('services/api/src/routes/caller-discovery.ts');
  const booking = source('services/api/src/routes/booking-discovery.ts');
  const callRequest = source('services/api/src/routes/caller-call-request.ts');
  const bookings = source('services/api/src/routes/bookings.ts');
  const callerBookings = source('services/api/src/routes/caller-bookings.ts');
  const mobileApi = source('apps/mobile/src/api.ts');
  const callerMobile = source('apps/mobile/src/CallerClosedBetaScreen.tsx');

  for (const current of [discovery, booking, callRequest, bookings, callerBookings]) {
    assert.match(current, /la\.status(?:::\w+)? IN \('approved','active'\)|la\.status\.toString\(\)/,
      'sellable Listener paths must be approval-state gated');
  }
  assert.match(discovery, /sp\.is_public=true/);
  assert.match(booking, /sp\.is_public=true/);
  assert.match(callRequest, /sp\.is_public=true/);
  assert.match(discovery, /workEligible: true/);
  assert.match(booking, /workEligible: true/);
  assert.doesNotMatch(discovery, /verified:\s*row\.is_verified/);
  assert.doesNotMatch(booking, /verified:\s*true/);

  assert.match(mobileApi, /workEligible: boolean/);
  assert.doesNotMatch(mobileApi, /\bverified:\s*boolean/);
  assert.match(callerMobile, /listener\.workEligible/);
  assert.doesNotMatch(callerMobile, /listener\.verified/);
});

test('W87 admin approval UI shows field-level KYC evidence and gates final decisions', () => {
  const page = source('apps/admin/app/listener-approvals/page.tsx');
  const adminKyc = source('services/api/src/routes/admin-kyc.ts');
  const adminProxy = source('apps/admin/app/api/ops/[...path]/route.ts');

  assert.match(adminKyc, /checkKind: check\.check_kind/);
  assert.match(adminKyc, /provider: check\.provider/);
  assert.match(adminKyc, /requestedAt: check\.requested_at/);
  assert.match(adminKyc, /resolvedAt: check\.resolved_at/);

  assert.match(page, /FIELD-LEVEL KYC EVIDENCE/);
  assert.match(page, /check\.provider/);
  assert.match(page, /check\.status/);
  assert.match(page, /check\.requestedAt/);
  assert.match(page, /check\.resolvedAt/);
  assert.match(page, /selected\?\.status === 'admin_review'/);
  assert.match(page, /decide\('approve'\)/);
  assert.match(page, /decide\('reject'\)/);
  assert.doesNotMatch(page, /identity verified/i);

  assert.match(adminProxy, /authorization: `Bearer \$\{token\}`/);
  assert.match(adminProxy, /browserMutationAllowed/);
});

test('W87 Listener agreement is an explicit action on Web and Mobile, never silent consent', () => {
  const webPage = source('apps/web/app/listener/agreement/page.tsx');
  const webLayout = source('apps/web/app/listener/layout.tsx');
  const webProxy = source('apps/web/app/api/listener/[...path]/route.ts');
  const mobileKyc = source('apps/mobile/src/ListenerKycScreen.tsx');
  const mobileTraining = source('apps/mobile/src/ListenerTrainingScreen.tsx');
  const mobileAgreementApi = source('apps/mobile/src/listener-agreement-api.ts');

  assert.match(webPage, /type="checkbox"/);
  assert.match(webPage, /accepted: true/);
  assert.match(webPage, /terms-2026-09-13/);
  assert.match(webPage, /listener\/agreement/);
  assert.match(webLayout, /agreement_pending/);
  assert.match(webProxy, /\^listener\\\/agreement\$/);

  assert.match(mobileTraining, /'agreement_pending'/);
  assert.match(mobileTraining, /return <ListenerKycScreen token=\{token\}/);
  assert.match(mobileKyc, /accessibilityRole="checkbox"/);
  assert.match(mobileKyc, /terms-2026-09-13/);
  assert.match(mobileKyc, /acceptListenerAgreement\(token\)/);
  assert.match(mobileAgreementApi, /body: JSON\.stringify\(\{ accepted: true \}\)/);
});
