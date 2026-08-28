import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dispatch = await readFile(new URL('../services/api/src/routes/call-dispatch.ts', import.meta.url), 'utf8');

const exactTerminationReasons = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

test('routing dispatch fails closed when any exact termination marker already exists', () => {
  assert.match(dispatch, /metadata->>'reason' = ANY\(\$2::text\[\]\)/);
  assert.match(dispatch, /throw new HttpError\(409, 'call_termination_in_progress'\)/);
  for (const reason of exactTerminationReasons) assert.match(dispatch, new RegExp(reason));
  assert.doesNotMatch(dispatch, /metadata->>'reason' LIKE/);
});

test('termination check happens before provider preflight, contact decryption and provider submission', () => {
  const terminationIndex = dispatch.indexOf('const termination = await client.query');
  const providerPreflightIndex = dispatch.indexOf('getTelephonyProvider()');
  const contactsIndex = dispatch.indexOf('const contacts = await client.query');
  const decryptIndex = dispatch.indexOf('decryptPrivateText(');
  const providerSubmitIndex = dispatch.indexOf('createBridgeCall');
  assert.ok(terminationIndex >= 0);
  assert.ok(providerPreflightIndex > terminationIndex);
  assert.ok(contactsIndex > providerPreflightIndex);
  assert.ok(decryptIndex > contactsIndex);
  assert.ok(providerSubmitIndex > decryptIndex);
});
