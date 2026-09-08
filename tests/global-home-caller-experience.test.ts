import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../apps/web/app/home.module.css', import.meta.url), 'utf8');

test('home makes the human-listening promise caller-first without opening closed conversation paths', () => {
  assert.match(page, /یک آدم واقعی گوش می‌دهد\. لازم نیست دنبال راه‌حل باشی/);
  assert.match(page, /هوش مصنوعی می‌تواند برای فکرکردن، نوشتن یا تحلیل مفید باشد/);
  assert.match(page, /شنیده‌شدن توسط یک نفر دیگر/);
  assert.match(page, /گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده/);
  assert.doesNotMatch(page, /href="\/talk"/);
  assert.doesNotMatch(page, /شروع گفت‌وگو/);
});

test('home explains caller control, listener boundaries and preparation with restrained claims', () => {
  assert.match(page, /تو انتخاب می‌کنی چه چیزی را بگویی/);
  assert.match(page, /تبادل راه ارتباط شخصی یا بردن رابطه به بیرون از سرویس/);
  assert.match(page, /معرفی‌ای که خود فرد می‌نویسد و اطلاعاتی که واقعاً بررسی شده‌اند، یک چیز محسوب نمی‌شوند/);
  assert.match(page, /قبل از ارزیابی، نقش و مرزهای شنونده آموزش داده می‌شود/);
  assert.match(page, /هرجا بررسی هویت در فرایند مربوط اعمال شود/);
  assert.match(page, /این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست/);
});

test('verified login state does not force normal users into listener onboarding', () => {
  assert.match(page, /\/api\/auth\/request/);
  assert.match(page, /\/api\/auth\/verify/);
  assert.match(page, /\/api\/auth\/logout/);
  assert.match(page, /برای ماندن در حساب لازم نیست وارد مسیر شنونده شوید/);
  assert.match(page, /اگر خودتان برای شنونده‌شدن آمده‌اید/);
  assert.match(page, /ادامه مسیر شنونده/);
});

test('home-scoped visual system explicitly protects focus, RTL reading and narrow mobile layouts', () => {
  assert.match(styles, /\.home :focus-visible/);
  assert.match(styles, /direction: rtl/);
  assert.match(styles, /@media \(max-width: 360px\)/);
  assert.match(styles, /min-height: 5[024]px/);
  assert.match(styles, /grid-template-columns/);
});
