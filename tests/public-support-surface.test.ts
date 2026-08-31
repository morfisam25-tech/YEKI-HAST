import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const supportEmail = 'sales@uniqueholding.com.tr';
const home = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const privacy = await readFile(new URL('../apps/web/app/privacy/page.tsx', import.meta.url), 'utf8');
const terms = await readFile(new URL('../apps/web/app/terms/page.tsx', import.meta.url), 'utf8');

test('verified support mailbox is reachable from all public policy surfaces', () => {
  for (const source of [home, privacy, terms]) {
    assert.match(source, new RegExp(`mailto:${supportEmail.replace(/\./g, '\\.')}`));
    assert.match(source, new RegExp(supportEmail.replace(/\./g, '\\.')));
  }
});
