import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../apps/web/app/home.module.css', import.meta.url), 'utf8');

const closedNotice = 'گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده';
const heroStart = page.indexOf('<section className={styles.hero}');
const heroEnd = page.indexOf('</section>', heroStart);
const hero = page.slice(heroStart, heroEnd);

test('home stays caller-first, tells the closed-service truth once and does not make login a hero destination', () => {
  assert.match(page, /یک آدم واقعی گوش می‌دهد\. لازم نیست دنبال راه‌حل باشی/);
  assert.match(page, /هوش مصنوعی می‌تواند برای فکرکردن، نوشتن یا تحلیل مفید باشد/);
  assert.equal(page.split(closedNotice).length - 1, 1);
  assert.match(hero, /href="#experience"/);
  assert.match(hero, /href="#trust"/);
  assert.doesNotMatch(hero, /href="#login"/);
  assert.doesNotMatch(page, /این توضیح وعده بازبودن سرویس نیست|وضعیت دسترسی فعلی همان است/);
  assert.doesNotMatch(page, /href="\/talk"/);
  assert.doesNotMatch(page, /شروع گفت‌وگو/);
});

test('home explains human listening, personal-contact boundaries, profile truth and proven future safety controls', () => {
  assert.match(page, /فضایی برای گفت‌وگوی محترمانه با یک شنونده انسانی/);
  assert.match(page, /درخواست یا ردوبدل‌کردن شماره، آیدی یا راه تماس برای ادامه یک رابطه شخصی بیرون از سرویس/);
  assert.match(page, /متن معرفی را خود شنونده می‌نویسد/);
  assert.match(page, /اگر موردی جداگانه بررسی شده باشد/);
  assert.match(page, /تماس را به شکل عادی پایان بدهی/);
  assert.match(page, /خروج امن جداگانه‌ای برای پایان تماس و مسدودکردن طرف مقابل/);
  assert.match(page, /شنونده پیش از ارزیابی با نقش و مرزهای آن آشنا می‌شود/);
  assert.match(page, /این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست/);
});

test('public home uses warm singular consumer voice while keeping implementation jargon out', () => {
  assert.match(page, /اگر فقط می‌خواهی با سرویس آشنا شوی، نیازی به ورود نیست/);
  assert.match(page, /اگر برای گفت‌وگو وارد شدی، گفت‌وگوی عمومی فعلاً باز نیست\. ورودت انجام شده و فعلاً کاری از طرف تو لازم نیست/);
  assert.match(page, /اگر برای شنونده‌شدن آمده‌ای/);
  assert.match(page, /تو انتخاب می‌کنی چه چیزی را بگویی/);
  assert.match(page, /\/api\/auth\/request/);
  assert.match(page, /\/api\/auth\/verify/);
  assert.match(page, /\/api\/auth\/logout/);
  assert.match(page, /ادامه مسیر شنونده/);
  assert.doesNotMatch(page, />[^<]*(?:v1\.2|HOLD|feature gate|JavaScript|cookie)[^<]*</i);
});

test('home explicitly surfaces trust, safety and FAQ routes without opening Caller', () => {
  assert.match(page, /href="\/trust"/);
  assert.match(page, /href="\/safety"/);
  assert.match(page, /href="\/faq"/);
  assert.match(page, /مرکز اعتماد/);
  assert.match(page, /ایمنی و گزارش/);
  assert.match(page, /پرسش‌های رایج/);
  assert.doesNotMatch(page, /href="\/talk"/);
});

test('home-scoped visual system keeps focus, RTL, mobile layout and readable trust-critical text', () => {
  assert.match(styles, /\.home :focus-visible/);
  assert.match(styles, /direction: rtl/);
  assert.match(styles, /@media \(max-width:\s*360px\)/);
  assert.match(styles, /min-height: 5[024]px/);
  assert.match(styles, /grid-template-columns/);
  assert.match(styles, /\.privacyNote[\s\S]*font-size: 13px/);
  assert.match(styles, /\.footer[\s\S]*font-size: 13px/);
  assert.doesNotMatch(page, /sectionNumber/);
});
