import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-safety.ts', import.meta.url), 'utf8');

test('safety actions require an authenticated admin', () => {
  assert.match(source, /const admin = await requireAdmin\(req\)/);
});

test('closed safety cases cannot be mutated again', () => {
  assert.match(source, /status::text IN \('open','reviewing'\)/);
  assert.match(source, /safety_case_closed/);
});

test('claim uses the canonical app.case_status enum value and never the drifted one', () => {
  // W36/G1: app.case_status enum is ('open','reviewing','resolved','dismissed').
  // The W29 code wrote 'in_review', which does not exist in the enum and fails at
  // runtime. Guard against any regression back to that value in this route.
  assert.doesNotMatch(source, /in_review/);
  assert.match(source, /action === 'claim' \? 'reviewing'/);
});

test('claim only takes open cases and review ownership is protected', () => {
  assert.match(source, /\$5='claim' AND status::text='open'/);
  assert.match(source, /assigned_admin_user_id IS NULL OR assigned_admin_user_id=\$3/);
  assert.match(source, /safety_case_conflict/);
});

test('resolving or dismissing requires a bounded resolution code', () => {
  assert.match(source, /RESOLUTION_RE/);
  assert.match(source, /invalid_resolution_code/);
  assert.match(source, /resolved_at=CASE WHEN \$2 IN \('resolved','dismissed'\) THEN now\(\) ELSE NULL END/);
});

test('claim assigns the acting admin and moves the case in review', () => {
  assert.match(source, /action === 'claim' \? 'reviewing'/);
  assert.match(source, /assigned_admin_user_id=\$3/);
  assert.match(source, /admin\.userId/);
});

test('safety case mutations and audit logging are atomic', () => {
  assert.match(source, /withTransaction/);
  assert.match(source, /INSERT INTO app\.audit_logs/);
  assert.match(source, /admin_safety_\$\{action\}/);
  assert.match(source, /targetStatus/);
});

test('safety operations never decrypt private report details', () => {
  assert.doesNotMatch(source, /decryptPrivateText/);
  assert.match(source, /privateDetailsIncluded: false/);
});
