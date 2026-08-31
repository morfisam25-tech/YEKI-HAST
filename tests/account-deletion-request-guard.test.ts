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

test('deletion request revokes sessions but does not pretend deletion is complete', () => {
  assert.match(route, /UPDATE private_data\.auth_sessions/);
  assert.match(route, /revoked_at=COALESCE\(revoked_at, now\(\)\)/);
  assert.match(route, /deletionCompleted: false/);
  assert.match(route, /account_deletion_requested/);
});

test('request is idempotent only while a prior deletion request is pending', () => {
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /metadata->>'processingState'='pending'/);
  assert.match(route, /alreadyRequested/);
});
