import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../apps/web/app/home.module.css', import.meta.url), 'utf8');
const globalStyles = await readFile(new URL('../apps/web/app/styles.css', import.meta.url), 'utf8');

const closedNotice = 'گفت‌وگوی عمومی فعلاً بسته است.';
const heroStart = page.indexOf('<section id="top" className={styles.hero}');
const heroEnd = page.indexOf('</section>', heroStart);
const hero = page.slice(heroStart, heroEnd);

test('home states the human value proposition, keeps Caller closed, and makes the login path explicit', () => {
  assert.match(page, /گفت‌وگو با یک شنوندهٔ انسانی/);
  assert.match(page, /گاهی فقط لازم است یکی واقعاً گوش بدهد/);
  assert.equal(page.split(closedNotice).length - 1, 1);
  assert.match(hero, /href="#how"/);
  assert.match(hero, /href="#login"/);
  assert.doesNotMatch(page, /این توضیح وعده بازبودن سرویس نیست|وضعیت دسترسی فعلی همان است/);
  assert.doesNotMatch(page, /href="\/talk"/);
  assert.doesNotMatch(page, /شروع گفت‌وگو/);
});

test('home explains human listening, boundaries and safety without claiming a clinical service', () => {
  assert.match(page, /یک آدم واقعی با توجه گوش می‌دهد/);
  assert.match(page, /بدون قضاوت/);
  assert.match(page, /مرزها را از اول روشن می‌کنیم/);
  assert.match(page, /لازم نیست چیزی را بگویی/);
  assert.match(page, /پایان تماس و گزارش‌کردن تجربه/);
  assert.match(page, /این درمان نیست/);
  assert.match(page, /خدمات اضطراری/);
});

test('public home uses clear consumer language while keeping implementation jargon out', () => {
  assert.match(page, /ورود فعلاً برای حساب و ادامهٔ مسیر شنونده‌شدن استفاده می‌شود/);
  assert.match(page, /گفت‌وگوی عمومی فعلاً بسته است/);
  assert.match(page, /مسیر شنونده‌شدن را ببین/);
  assert.match(page, /با زبان خودت حرف بزنی/);
  assert.match(page, /\/api\/auth\/request/);
  assert.match(page, /\/api\/auth\/verify/);
  assert.match(page, /\/api\/auth\/logout/);
  assert.match(page, /مسیر شنونده‌شدن/);
  assert.doesNotMatch(page, /\bv1\.2\b|\bHOLD\b|\bfeature gate\b|\bJavaScript\b|\bcookie\b/i);
});

test('home explicitly surfaces trust, safety and FAQ routes without opening Caller', () => {
  assert.match(page, /href="\/trust"/);
  assert.match(page, /href="\/safety"/);
  assert.match(page, /href="\/faq"/);
  assert.match(page, /مرکز اعتماد/);
  assert.match(page, /ایمنی/);
  assert.match(page, /پرسش‌های رایج/);
  assert.doesNotMatch(page, /href="\/talk"/);
});

test('home-scoped visual system keeps focus, RTL, mobile layout and readable trust-critical text', () => {
  assert.match(globalStyles, /button:focus-visible/);
  assert.match(styles, /direction: rtl/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /min-height: 570px/);
  assert.match(styles, /grid-template-columns/);
  assert.match(styles, /\.footer[\s\S]*font-size: 12px/);
  assert.doesNotMatch(page, /sectionNumber/);
});
