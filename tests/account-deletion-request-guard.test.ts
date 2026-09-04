import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../services/api/src/routes/account-deletion.ts', import.meta.url), 'utf8');

test('authenticated deletion request is wired into the API', () => {
  assert.match(handler, /POST' && url\.pathname === '\/v1\/account\/deletion-request'/);
  assert.match(handler, /requestAccountDeletion/);
  assert.match(route, /requireAuth\(req\)/);
});

test('active operations administrators are rejected before request or session side effects', () => {
  assert.match(route, /requireSelfServiceDeletableAccount/);
  assert.match(route, /FROM app\.admin_users/);
  assert.match(route, /user_id=\$1 AND is_active=true/);
  assert.match(route, /admin_account_deletion_requires_transfer/);
  const preflight = route.indexOf('requireSelfServiceDeletableAccount(userId)');
  const request = route.indexOf('ensurePendingDeletionRequest(userId)');
  assert.ok(preflight > -1 && request > preflight, 'admin preflight must precede deletion request/revocation');
});

test('deletion revocation commits before destructive completion is attempted', () => {
  assert.match(route, /ensurePendingDeletionRequest/);
  assert.match(route, /UPDATE private_data\.auth_sessions/);
  assert.match(route, /revoked_at=COALESCE\(revoked_at, now\(\)\)/);
  assert.match(route, /tryCompleteDeletion/);
  assert.ok(route.indexOf('ensurePendingDeletionRequest(userId)') < route.indexOf('tryCompleteDeletion(userId, requestId)'));
});

test('clean Technical Beta accounts are physically deleted with identity-linked OTP history', () => {
  assert.match(route, /DELETE FROM private_data\.email_otp_challenges WHERE email_hash=\$1/);
  assert.match(route, /DELETE FROM private_data\.otp_challenges WHERE phone_hash=\$1/);
  assert.match(route, /DELETE FROM app\.users WHERE id=\$1 RETURNING id/);
  assert.match(route, /processingState','completed'/);
  assert.match(route, /identityLinkRemoved',true/);
});

test('retention-sensitive FK conflicts fail closed into review instead of fake completion', () => {
  assert.match(route, /sqlError\?\.code === '23503'/);
  assert.match(route, /return 'review_required'/);
  assert.match(route, /deletionCompleted \? 200 : 202/);
  assert.match(route, /deletionCompleted,/);
  assert.match(route, /reviewRequired: !deletionCompleted/);
});

test('request stays idempotent only while a prior deletion request is pending', () => {
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /metadata->>'processingState'='pending'/);
  assert.match(route, /alreadyRequested/);
});
