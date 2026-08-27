import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/call-dispatch.ts', import.meta.url), 'utf8');

test('ambiguous dispatch does not release authorization or claim terminal failure', () => {
  const createIndex = source.indexOf('createBridgeCall');
  const catchIndex = source.indexOf('} catch {', createIndex);
  const persistIndex = source.indexOf('const persisted = await query', catchIndex);
  assert.ok(createIndex >= 0 && catchIndex > createIndex && persistIndex > catchIndex);
  const ambiguousSection = source.slice(catchIndex, persistIndex);
  assert.match(ambiguousSection, /dispatch_result_uncertain/);
  assert.match(ambiguousSection, /telephony_dispatch_uncertain/);
  assert.doesNotMatch(ambiguousSection, /reserved_minor=reserved_minor-/);
  assert.doesNotMatch(ambiguousSection, /SET status='failed'/);
  assert.doesNotMatch(ambiguousSection, /VALUES \(\$1,'failed'/);
});

test('dispatch retry remains on the same call session and never creates a new app call', () => {
  assert.match(source, /row\.status !== 'routing' && row\.status !== 'calling_caller'/);
  assert.match(source, /callSessionId: claimed\.callId/);
  assert.doesNotMatch(source, /INSERT INTO app\.call_sessions/);
});
