import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const trustPath = new URL('../apps/web/app/trust/page.tsx', import.meta.url);
const safetyPath = new URL('../apps/web/app/safety/page.tsx', import.meta.url);
const faqPath = new URL('../apps/web/app/faq/page.tsx', import.meta.url);
const trustCssPath = new URL('../apps/web/app/trust/trust.module.css', import.meta.url);
const safetyCssPath = new URL('../apps/web/app/safety/safety.module.css', import.meta.url);
const faqCssPath = new URL('../apps/web/app/faq/faq.module.css', import.meta.url);

const trust = await readFile(trustPath, 'utf8');
const safety = await readFile(safetyPath, 'utf8');
const faq = await readFile(faqPath, 'utf8');
const trustCss = await readFile(trustCssPath, 'utf8');
const safetyCss = await readFile(safetyCssPath, 'utf8');
const faqCss = await readFile(faqCssPath, 'utf8');
const pages = [trust, safety, faq];
const styles = [trustCss, safetyCss, faqCss];

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
  /رمزگذاری (?:سرتاسری|انتها به انتها)/,
  /تضمین امنیت/,
  /امنیت تضمین‌شده/,
  /امنیت کامل/,
  /تماس ناشناس/,
  /استفاده ناشناس/,
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

function assertStrongLinkFocus(css: string, label: string) {
  assert.match(
    css,
    /\.page a:focus-visible\s*\{[^}]*outline:\s*[3-9]px\s+solid\s+#[0-9a-f]{6};[^}]*outline-offset:\s*[3-9]px;/is,
    `${label} should use an opaque 3px+ focus outline with visible separation`,
  );
  assert.doesNotMatch(css, /\.page a:focus-visible\s*\{[^}]*rgba\(/is, `${label} focus should not be translucent`);
  assert.doesNotMatch(css, /:focus-visible\s*\{[^}]*outline:\s*(?:0|none)/is, `${label} should not remove focus outlines`);
  assert.ok(css.indexOf('.page a:focus-visible') < css.indexOf('@media'), `${label} focus rule should apply before responsive media rules`);
}

test('trust supporting pages avoid unsupported trust and security claims', () => {
  for (const source of pages) {
    for (const claim of forbiddenTrustClaims) assert.doesNotMatch(source, claim);
  }
  assert.doesNotMatch(trust, /ورود با ایمیل و امنیت حساب/);
  assert.match(trust, /ورود با ایمیل و مدیریت حساب/);
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
  for (const phrase of ['پرداخت و تسویه عمومی', 'احراز هویت بیرونی برای مسیر عمومی', 'ورود با پیامک']) assert.match(trust, new RegExp(phrase));
  assert.match(faq, /ورود با پیامک هم برای عموم فعال نیست/);
});

test('focus-visible treatment is strong and the previous translucent focus colors are gone', () => {
  assertStrongLinkFocus(trustCss, 'Trust');
  assertStrongLinkFocus(safetyCss, 'Safety');
  assertStrongLinkFocus(faqCss, 'FAQ');
  assert.match(
    faqCss,
    /\.item summary:focus-visible\s*\{[^}]*outline:\s*[3-9]px\s+solid\s+#[0-9a-f]{6};[^}]*outline-offset:\s*[3-9]px;/is,
  );
  assert.ok(faqCss.indexOf('.item summary:focus-visible') < faqCss.indexOf('@media'), 'FAQ summary focus should survive responsive layouts');
  const joinedStyles = styles.join('\n');
  for (const weakValue of ['rgba(40, 89, 76, 0.28)', 'rgba(20, 88, 71, 0.32)', 'rgba(139, 91, 59, 0.34)']) {
    assert.doesNotMatch(joinedStyles, new RegExp(weakValue.replace(/[()]/g, '\\$&')));
  }
});

test('safety and FAQ use globally usable emergency wording without defaulting to official authorities', () => {
  for (const source of [safety, faq]) {
    assert.match(source, /«یکی هست» سرویس پاسخ اضطراری نیست/);
    assert.match(source, /منتظر شنونده نمانید/);
    assert.match(source, /در دسترس، مناسب و امن/);
    assert.match(source, /فرد قابل اعتماد نزدیک/);
    assert.match(source, /اگر دسترسی به آن برای شما امن و ممکن است/);
    assert.doesNotMatch(source, /(?:فقط|حتماً|باید)[^\n.]{0,80}(?:پلیس|مراجع رسمی|خدمات اضطراری)/);
    assert.doesNotMatch(source, /\b(?:911|112|999|110|115|125)\b/);
  }
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
  assert.match(safety, /فقط برای شرکت‌کنندگان همان تماس در نظر گرفته شده‌اند/);
});

test('FAQ uses native details and gives a short-answer layer', () => {
  const detailCount = (faq.match(/<details/g) ?? []).length;
  assert.ok(detailCount >= 1, 'FAQ should render native details elements');
  assert.match(faq, /shortAnswer/);
  assert.match(faq, /پرداخت عمومی فعلاً فعال نیست/);
  assert.match(faq, /«یکی هست» سرویس پاسخ اضطراری نیست/);
});
