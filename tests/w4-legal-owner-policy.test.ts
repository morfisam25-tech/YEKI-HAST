import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const privacy = await readFile(new URL('../apps/web/app/privacy/page.tsx', import.meta.url), 'utf8');
const terms = await readFile(new URL('../apps/web/app/terms/page.tsx', import.meta.url), 'utf8');
const faq = await readFile(new URL('../apps/web/app/faq/page.tsx', import.meta.url), 'utf8');
const safety = await readFile(new URL('../apps/web/app/safety/page.tsx', import.meta.url), 'utf8');
const ownerFacts = await readFile(new URL('../docs/W4_LEGAL_OWNER_FACTS_2026-09-08.md', import.meta.url), 'utf8');

const legalName = 'MOHAMMAD SAEED FARAHMAND SILAB';
const noticeAddress = 'PİRİ REİS Mah. 2268. Sk. B NO:5 /1, ESENYURT İSTANBUL, TÜRKİYE';

test('public and formal operator identities are explicit and consistent', () => {
  for (const source of [privacy, terms, ownerFacts]) {
    assert.match(source, /Sai Morfi/);
    assert.match(source, new RegExp(legalName));
  }
  assert.match(privacy, new RegExp(noticeAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(terms, new RegExp(noticeAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('public human conversation is locked to 18 plus', () => {
  assert.match(terms, /۱۸ سال و بالاتر/);
  assert.match(terms, /۱۸ سال یا بیشتر/);
  assert.match(faq, /۱۸ سال و بالاتر/);
});

test('first launch recording policy is explicit', () => {
  assert.match(privacy, /ضبط پلتفرمی برای اولین عرضه خاموش است/);
  assert.match(privacy, /ضبط گفت‌وگو توسط شرکت‌کننده نیز در سیاست عرضه اول مجاز نیست/);
  assert.match(terms, /ضبط پلتفرمی در عرضه اول خاموش است/);
  assert.match(terms, /ضبط صدا، ضبط صفحه/);
  assert.match(faq, /ضبط توسط شرکت‌کننده نیز در سیاست عرضه اول مجاز نیست/);
});

test('privacy copy carries no-sale and no-targeted-advertising policy', () => {
  assert.match(privacy, /فروش داده شخصی/);
  assert.match(privacy, /تبلیغات هدفمند/);
  assert.match(faq, /فروش داده شخصی/);
  assert.match(faq, /تبلیغات هدفمند/);
});

test('closed public runtime remains clear and safety has a real contact destination', () => {
  assert.match(privacy, /مسیر عمومی تماس صوتی بسته است/);
  assert.match(terms, /تماس صوتی عمومی بسته است/);
  assert.match(faq, /گفت‌وگوی صوتی عمومی و رزرو شنونده هنوز برای استفاده همگانی باز نشده‌اند/);
  assert.match(safety, /گفت‌وگوی عمومی هنوز باز نشده است/);
  assert.match(safety, /sales@uniqueholding\.com\.tr/);
});
