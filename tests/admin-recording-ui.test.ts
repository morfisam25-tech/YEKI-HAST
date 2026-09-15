import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../apps/admin/app/recordings/page.tsx', import.meta.url), 'utf8');
const layout = await readFile(new URL('../apps/admin/app/layout.tsx', import.meta.url), 'utf8');
const routes = await readFile(new URL('../services/api/src/routes/admin-recording.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');

test('admin nav links to the recordings page', () => {
  assert.match(layout, /href="\/recordings"/);
});

test('admin recordings UI looks up a recording by safety case, not by raw storage id', () => {
  assert.match(page, /\/api\/ops\/safety-cases\/\$\{caseKind\}\/\$\{encodeURIComponent\(id\)\}\/recording/);
  assert.match(page, /'reports' \| 'events'/);
});

test('admin recordings UI requests a case-linked, reason-coded, audited playback grant', () => {
  assert.match(page, /\/api\/ops\/recordings\/\$\{encodeURIComponent\(recording\.id\)\}\/playback-grant/);
  assert.match(page, /reasonCode/);
  assert.match(page, /caseKind: toApiCaseKind\(caseKind\)/);
});

test('admin recordings UI exposes legal hold set/release through the existing admin routes', () => {
  assert.match(page, /\/api\/ops\/recordings\/\$\{encodeURIComponent\(recording\.id\)\}\/hold/);
  assert.match(page, /\/hold\/release/);
});

test('admin recordings UI never renders a raw storage reference, provider secret, or download link', () => {
  assert.doesNotMatch(page, /storage_reference/);
  assert.doesNotMatch(page, /provider_recording_id/i);
  assert.doesNotMatch(page, /download=/);
  assert.doesNotMatch(page, /<a[^>]+href=\{.*playbackUrl/);
});

test('every admin recording route the UI calls requires the recording_admin capability', () => {
  assert.match(routes, /requireAdminCapability\(req, RECORDING_CAPABILITY\)/);
  const grants = routes.match(/requireAdminCapability\(req, RECORDING_CAPABILITY\)/g) ?? [];
  assert.ok(grants.length >= 4, 'expected getRecordingForSafetyCase, requestRecordingPlaybackGrant, setRecordingHold, releaseRecordingHold to all gate on recording_admin');
});

test('admin recording routes stay registered in the handler', () => {
  assert.ok(handler.includes('adminRecordingForCaseMatch'), 'GET recording-for-case route missing from handler');
  assert.ok(handler.includes('adminRecordingPlaybackGrantMatch'), 'POST playback-grant route missing from handler');
  assert.ok(handler.includes('adminRecordingHoldMatch'), 'POST hold route missing from handler');
  assert.ok(handler.includes('adminRecordingHoldReleaseMatch'), 'POST hold/release route missing from handler');
});
