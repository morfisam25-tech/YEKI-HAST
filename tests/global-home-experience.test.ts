import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../apps/web/app/home.module.css', import.meta.url), 'utf8');

test('public home leads with a caller-facing human proposition instead of listener recruitment', () => {
  assert.match(home, /حرفی هست که می‌خواهید یک آدم واقعی بشنود/);
  assert.match(home, /گاهی چیزی که کم است، پاسخ نیست؛ حضور یک نفر دیگر است/);
  assert.match(home, /می‌توانید فقط حرف بزنید/);
  assert.match(home, /هوش مصنوعی می‌تواند برای فکرکردن، نوشتن یا مرتب‌کردن موضوع‌ها مفید باشد/);
  assert.match(home, /فقط می‌خواهم بگویم چه شد\. فعلاً دنبال راه‌حل نیستم/);
});

test('home keeps closed public conversation explicit without presenting a fake launch action', () => {
  assert.match(home, /گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده/);
  assert.match(home, /در این صفحه دکمه‌ای برای شروع قابلیتی که فعال نشده وجود ندارد/);
  assert.doesNotMatch(home, /href="\/talk"/);
  assert.doesNotMatch(home, /href="\/booking"/);
  assert.doesNotMatch(home, /لیست انتظار|به‌زودی در تاریخ|قیمت از/);
});

test('verified state separates the caller reality from the listener path', () => {
  assert.match(home, /برای گفت‌وگو آمده‌اید؟/);
  assert.match(home, /لازم نیست وارد مسیر شنونده شوید/);
  assert.match(home, /برای شنونده‌شدن آمده‌اید؟/);
  assert.match(home, /href="\/listener">ادامه مسیر شنونده/);
});

test('trust copy states user control, role boundaries and profile truth without absolute privacy claims', () => {
  assert.match(home, /شما تصمیم می‌گیرید چه چیزی را مطرح کنید/);
  assert.match(home, /پروفایل، با تأیید پلتفرم یکی نیست/);
  assert.match(home, /این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست/);
  assert.doesNotMatch(home, /کاملاً ناشناس|۱۰۰٪ محرمانه|رمزگذاری سرتاسری|هیچ‌کس.*دسترسی/);
});

test('page-scoped styling provides explicit RTL, focus, reduced-motion and small-screen treatment', () => {
  assert.match(home, /import styles from '\.\/home\.module\.css'/);
  assert.match(styles, /direction:\s*rtl/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /@media \(max-width: 360px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('email OTP and logout contracts remain same-origin and unchanged in shape', () => {
  assert.match(home, /postJson\('\/api\/auth\/request', \{ email: normalized \}\)/);
  assert.match(home, /postJson\('\/api\/auth\/verify', \{ email: verifiedEmail, code \}\)/);
  assert.match(home, /fetch\('\/api\/auth\/logout', \{ method: 'POST' \}\)/);
  assert.match(home, /value\.trim\(\)\.toLowerCase\(\)/);
  assert.match(home, /\^\\d\{6\}\$/);
});
