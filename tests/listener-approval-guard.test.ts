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
  const mobileApi = source('apps/mobile/src/api.ts');

  for (const current of [discovery, booking, callRequest]) {
    assert.match(current, /la\.status IN \('approved','active'\)/);
    assert.match(current, /sp\.is_public=true/);
  }
  assert.match(discovery, /workEligible: true/);
  assert.match(booking, /workEligible: true/);
  assert.doesNotMatch(discovery, /verified:\s*row\.is_verified/);
  assert.doesNotMatch(booking, /verified:\s*true/);

  assert.match(mobileApi, /type BrowseListenerWire = Omit<BrowseListener, 'verified'> & \{ workEligible: boolean \}/);
  assert.match(mobileApi, /verified: workEligible/);
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

test('W87 Listener agreement is a real explicit UI action, not silent consent', () => {
  const page = source('apps/web/app/listener/agreement/page.tsx');
  const layout = source('apps/web/app/listener/layout.tsx');
  const proxy = source('apps/web/app/api/listener/[...path]/route.ts');

  assert.match(page, /type="checkbox"/);
  assert.match(page, /accepted: true/);
  assert.match(page, /terms-2026-09-13/);
  assert.match(page, /listener\/agreement/);
  assert.match(layout, /agreement_pending/);
  assert.match(proxy, /\^listener\\\/agreement\$/);
});
