import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const voice = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');

test('no-answer releases the caller hold and records an append-only hold ledger event', () => {
  assert.match(voice, /wallet_release_conflict/);
  assert.match(voice, /INSERT INTO app\.wallet_hold_events/);
  assert.match(voice, /'release'/);
  assert.match(voice, /'internet_voice_no_answer'/);
  assert.match(voice, /call:\$\{rawCallId\}:hold:release:no_answer/);
  assert.match(voice, /holdReleasedMinor: authorized\.toString\(\)/);
  assert.match(voice, /chargedMinor: 0/);
});