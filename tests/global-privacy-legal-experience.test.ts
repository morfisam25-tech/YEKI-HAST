import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const privacy = await readFile(new URL('../apps/web/app/privacy/page.tsx', import.meta.url), 'utf8');
const terms = await readFile(new URL('../apps/web/app/terms/page.tsx', import.meta.url), 'utf8');
const deletion = await readFile(new URL('../apps/web/app/account/delete/page.tsx', import.meta.url), 'utf8');
const decisions = await readFile(new URL('../docs/GLOBAL_LEGAL_OWNER_DECISIONS.md', import.meta.url), 'utf8');

test('privacy presents plain answers before technical detail', () => {
  const shortStart = privacy.indexOf('id="privacy-short-answers"');
  const detailStart = privacy.indexOf('id="privacy-data-detail"');
  assert.ok(shortStart >= 0 && detailStart > shortStart);

  const firstLayer = privacy.slice(shortStart, detailStart);
  for (const technicalTerm of ['RECORD_AUDIO', 'WebRTC', 'TURN', 'HttpOnly', 'SecureStore', 'fail-closed']) {
    assert.doesNotMatch(firstLayer, new RegExp(technicalTerm));
  }

  assert.match(privacy, /مسیر عمومی تماس صوتی بسته است/);
  assert.match(privacy, /مسیری برای ضبط یا ذخیره محتوای صوتی مکالمه ندارد/);
  assert.match(privacy, /نمی‌توان تضمین کرد یک شرکت‌کننده، سیستم‌عامل یا دستگاه دیگری هیچ‌وقت امکان ضبط نداشته باشد/);
  assert.match(privacy, /زمان انقضای پنج‌دقیقه‌ای/);
});

test('terms set explicit participant safety and privacy boundaries', () => {
  assert.match(terms, /ضبط صدا، ضبط صفحه/);
  assert.match(terms, /انتشار «داستان کاربر»/);
  assert.match(terms, /شماره تلفن، نشانی، ایمیل شخصی، شناسه شبکه اجتماعی/);
  assert.match(terms, /آزار، تهدید/);
  assert.match(terms, /درخواست جنسی/);
  assert.match(terms, /پزشک، روان‌شناس، درمانگر، وکیل/);
  assert.match(terms, /سرویس اضطراری نیست/);
  assert.match(terms, /تماس صوتی عمومی در وضعیت فعلی باز نیست/);
});

test('deletion UI preserves completed versus review-required backend semantics', () => {
  assert.match(deletion, /setStep\(payload\.deletionCompleted \? 'completed' : 'requested'\)/);
  assert.match(deletion, /نشست‌های فعال حساب لغو شده‌اند/);
  assert.match(deletion, /حذف هنوز کامل نشده است/);
  assert.match(deletion, /این وضعیت به معنی حذف کامل حساب نیست/);
  assert.doesNotMatch(deletion, /تیکت|ticket|ایمیل تأیید حذف|زمان تقریبی|ETA|دانلود داده/);
});

test('owner decision record keeps unresolved legal facts out of public assertions', () => {
  for (const category of ['PROVEN CURRENT FACT', 'CLOSED / FUTURE CAPABILITY', 'UNKNOWN', 'OWNER DECISION']) {
    assert.match(decisions, new RegExp(category.replace('/', '\\/')));
  }

  for (const field of ['DECISION', 'WHY IT MATTERS', 'WHAT REPO PROVES', 'WHAT IS UNKNOWN', 'OPTIONS', 'RECOMMENDATION', 'LAUNCH CONSEQUENCE']) {
    assert.match(decisions, new RegExp(`\\*\\*${field}\\*\\*`));
  }

  assert.match(decisions, /OPERATOR \/ CONTROLLER IDENTITY/);
  assert.match(decisions, /RETENTION SCHEDULE/);
  assert.match(decisions, /AGE \/ MINORS/);
  assert.match(decisions, /INTERNATIONAL DATA HANDLING \/ SUBPROCESSORS/);
});
