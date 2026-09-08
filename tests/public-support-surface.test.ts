import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const supportEmail = 'sales@uniqueholding.com.tr';
const home = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const privacy = await readFile(new URL('../apps/web/app/privacy/page.tsx', import.meta.url), 'utf8');
const terms = await readFile(new URL('../apps/web/app/terms/page.tsx', import.meta.url), 'utf8');
const emailSmoke = await readFile(new URL('../scripts/smoke-production-email-auth.mjs', import.meta.url), 'utf8');

test('selected support mailbox is reachable from all checked-in public policy surfaces', () => {
  for (const source of [home, privacy, terms]) {
    assert.match(source, new RegExp(`mailto:${supportEmail.replace(/\./g, '\\.')}`));
    assert.match(source, new RegExp(supportEmail.replace(/\./g, '\\.')));
  }
});

test('mailbox usability is not treated as proven by source alone and production release carries a real mailbox E2E', () => {
  assert.match(emailSmoke, /https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me/);
  assert.match(emailSmoke, /https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/);
  assert.match(emailSmoke, /fresh production OTP email was not observed in the Gmail inbox/);
  assert.match(emailSmoke, /production Email OTP delivery \+ verify \+ session \+ logout E2E PASS/);
  assert.doesNotMatch(emailSmoke, /imap\.gmail\.com/);
});

test('public home describes human listening without advertising closed conversation capability', () => {
  assert.match(home, /فضایی برای گفت‌وگوی محترمانه با یک شنونده انسانی/);
  assert.match(home, /شنونده به شما فرصت حرف‌زدن می‌دهد/);
  assert.match(home, /این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست/);
  assert.match(home, /گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده/);
  assert.doesNotMatch(home, /Caller|HOLD|Internet Voice|تماس تلفنی ماسک‌شده|v1\./);
});
