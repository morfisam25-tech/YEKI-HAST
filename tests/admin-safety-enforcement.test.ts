import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// W36 / Task D — static guards for the admin safety suspension capability and its
// fail-closed enforcement gates. The behavioural proof is in
// tests/admin-safety-enforcement-runtime-db.test.ts (real isolated Postgres).

const route = await readFile(new URL('../services/api/src/routes/admin-safety-enforcement.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const callRequest = await readFile(new URL('../services/api/src/routes/caller-call-request.ts', import.meta.url), 'utf8');
const marketplace = await readFile(new URL('../services/api/src/routes/marketplace.ts', import.meta.url), 'utf8');

test('suspension is admin-only and reason-coded', () => {
  assert.match(route, /const admin = await requireAdmin\(req\)/);
  assert.match(route, /reasonCodeFrom/);
  assert.match(route, /invalid_reason_code/);
});

test('suspension reuses the existing app.user_status state, not a new system', () => {
  assert.match(route, /\$2::app\.user_status/);
  assert.match(route, /'suspend' \? 'suspended' : 'active'/);
});

test('suspension is atomic and audited', () => {
  assert.match(route, /withTransaction/);
  assert.match(route, /INSERT INTO app\.audit_logs/);
  assert.match(route, /admin_safety_\$\{action\}/);
  assert.match(route, /reasonCode/);
});

test('suspension is idempotent and guards self/admin/archived', () => {
  assert.match(route, /changed: false/);
  assert.match(route, /cannot_suspend_self/);
  assert.match(route, /cannot_suspend_admin/);
  assert.match(route, /user_archived/);
});

test('suspension never mutates wallet, payout, report, or block data', () => {
  // Only app.users (status flip), app.admin_users (read), and app.audit_logs
  // (append) may be referenced. Match app.-qualified table names so prose in the
  // file's own comments cannot satisfy these guards.
  assert.doesNotMatch(route, /app\.wallets/);
  assert.doesNotMatch(route, /app\.payouts|app\.payout_items|app\.listener_earnings/);
  assert.doesNotMatch(route, /app\.reports/);
  assert.doesNotMatch(route, /app\.blocks/);
  assert.doesNotMatch(route, /\bDELETE\b/);
});

test('the suspension route is wired behind requireAdmin routing', () => {
  assert.match(handler, /safety-limitation\$?\//);
  assert.match(handler, /setAdminUserSafetyLimitation/);
});

test('instant match excludes non-active (suspended) listeners', () => {
  assert.match(callRequest, /JOIN app\.users su ON su\.id=lp\.user_id AND su\.status='active'/);
});

test('marketplace browse excludes non-active (suspended) listeners', () => {
  assert.match(marketplace, /JOIN app\.users mu ON mu\.id=lp\.user_id AND mu\.status='active'/);
});
