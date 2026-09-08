import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const trustPath = new URL('../apps/web/app/trust/page.tsx', import.meta.url);
const safetyPath = new URL('../apps/web/app/safety/page.tsx', import.meta.url);
const faqPath = new URL('../apps/web/app/faq/page.tsx', import.meta.url);

const trust = await readFile(trustPath, 'utf8');
const safety = await readFile(safetyPath, 'utf8');
const faq = await readFile(faqPath, 'utf8');
const pages = [trust, safety, faq];

const forbiddenTrustClaims = [
  /end[- ]to[- ]end encryption/i,
  /anonymous calls?/i,
  /SOC\s*2/i,
  /ISO\s*27001/i,
  /background checks?/i,
  /24\s*\/\s*7/i,
  /response SLA/i,
  /data (?:location|residency)/i,
  /government verification/i,
  /user count/i,
  /testimonials?/i,
];

const internalRouteFiles: Record<string, string> = {
  '/': '../apps/web/app/page.tsx',
  '/trust': '../apps/web/app/trust/page.tsx',
  '/safety': '../apps/web/app/safety/page.tsx',
  '/faq': '../apps/web/app/faq/page.tsx',
  '/privacy': '../apps/web/app/privacy/page.tsx',
  '/terms': '../apps/web/app/terms/page.tsx',
  '/account/delete': '../apps/web/app/account/delete/page.tsx',
};

test('trust supporting pages avoid unsupported trust claims', () => {
  for (const source of pages) {
    for (const claim of forbiddenTrustClaims) assert.doesNotMatch(source, claim);
  }
});

test('all hard-coded internal links in the new pages resolve to checked-in routes', async () => {
  const links = new Set<string>();
  for (const source of pages) {
    for (const match of source.matchAll(/href="(\/[^"?#]*)"/g)) links.add(match[1]);
  }

  for (const href of links) {
    const relativePath = internalRouteFiles[href];
    assert.ok(relativePath, `unrecognized internal route in trust surface: ${href}`);
    await access(new URL(relativePath, import.meta.url));
  }
});

test('all three pages clearly preserve the closed public conversation state', () => {
  assert.match(trust, /گفت‌وگوی عمومی و رزرو شنونده هنوز برای استفاده همگانی باز نیست/);
  assert.match(safety, /گفت‌وگوی عمومی هنوز باز نشده است/);
  assert.match(faq, /گفت‌وگوی صوتی عمومی و رزرو شنونده هنوز برای استفاده همگانی باز نشده‌اند/);
});

test('safety page states emergency boundary without inventing a universal number', () => {
  assert.match(safety, /«یکی هست» سرویس پاسخ اضطراری نیست/);
  assert.match(safety, /خدمات اضطراری معتبرِ محل خود/);
  assert.doesNotMatch(safety, /\b(?:911|112|999|110|115|125)\b/);
});

test('trust page distinguishes self-written profile claims from explicit verification', () => {
  assert.match(trust, /«خوداظهاری»/);
  assert.match(trust, /مگر اینکه کنار همان مورد صریحاً گفته شود بررسی شده است/);
  assert.match(trust, /احراز هویت بیرونی در مسیر عمومی فعلی فعال نیست/);
});

test('safety page only describes implemented call safety categories and marks them non-public today', () => {
  for (const phrase of ['آزار', 'تهدید', 'رفتار جنسی', 'درخواست ارتباط خارج از سرویس', 'نقض حریم خصوصی', 'کلاهبرداری']) {
    assert.match(safety, new RegExp(phrase));
  }
  assert.match(safety, /به معنی در دسترس‌بودن عمومی امروز نیست/);
});

test('FAQ uses native details and gives a short-answer layer', () => {
  const detailCount = (faq.match(/<details/g) ?? []).length;
  assert.ok(detailCount >= 1, 'FAQ should render native details elements');
  assert.match(faq, /shortAnswer/);
  assert.match(faq, /پرداخت عمومی فعلاً فعال نیست/);
  assert.match(faq, /«یکی هست» سرویس پاسخ اضطراری نیست/);
});
