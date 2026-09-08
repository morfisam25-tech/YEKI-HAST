import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const onboarding = await readFile(new URL('../apps/web/app/listener/page.tsx', import.meta.url), 'utf8');
const scopedStyles = await readFile(new URL('../apps/web/app/listener/listener.module.css', import.meta.url), 'utf8');

test('Listener preparation keeps backend training and assessment identity stable', () => {
  for (const moduleKey of ['active_listening', 'role_boundary', 'safety', 'platform_rules']) {
    assert.match(onboarding, new RegExp(`key: '${moduleKey}'`));
  }
  for (const questionKey of [
    'q_venting',
    'q_open_question',
    'q_advice',
    'q_validation',
    'q_silence',
    'q_contact',
    'q_safety',
    'q_closing',
  ]) {
    assert.match(onboarding, new RegExp(`key: '${questionKey}'`));
  }
  for (const answerValue of [
    'follow_need', 'gentle_advice', 'share_story',
    'open_question', 'solution_question', 'normalise_away',
    'explore_choice', 'give_personal_answer', 'refuse_topic',
    'reflect_feeling', 'diagnose', 'minimise',
    'allow_silence', 'fill_silence', 'push_answer',
    'keep_boundary', 'trust_exception', 'shame_request',
    'state_limit', 'take_control', 'ignore_risk',
    'clear_close', 'promise_access', 'abrupt_end',
  ]) {
    assert.match(onboarding, new RegExp(`'${answerValue}'`));
  }
  assert.match(onboarding, /listener\/training\/complete/);
  assert.match(onboarding, /listener\/assessment/);
  assert.match(onboarding, /scenarioVersion: 'listener-training-v2'/);
});

test('Listener language proficiency is explicit per selected language', () => {
  assert.match(onboarding, /type LanguageProficiency = 'conversational' \| 'fluent' \| 'native'/);
  assert.match(onboarding, /value: 'conversational', label: 'مکالمه‌ای'/);
  assert.match(onboarding, /value: 'fluent', label: 'روان'/);
  assert.match(onboarding, /value: 'native', label: 'زبان مادری'/);
  assert.match(onboarding, /languageProficiencies/);
  assert.match(onboarding, /selectedLanguages\.every\(\(code\) => Boolean\(languageProficiencies\[code\]\)\)/);
  assert.match(onboarding, /selectedLanguages\.length <= 10/);
  assert.match(onboarding, /delete next\[code\]/);
  assert.match(onboarding, /languages: selectedLanguages\.map/);
  assert.match(onboarding, /proficiency: languageProficiencies\[code\]/);
  assert.match(onboarding, /هیچ سطحی به‌صورت خودکار انتخاب نمی‌شود/);
  assert.doesNotMatch(onboarding, /proficiency:\s*'fluent'/);
});

test('Listener training explicitly teaches privacy, personal boundaries and cultural humility', () => {
  assert.match(onboarding, /برای دوستان بازگو نکنید/);
  assert.match(onboarding, /اسکرین‌شات نگیرید/);
  assert.match(onboarding, /پست یا محتوا منتشر نکنید/);
  assert.match(onboarding, /ضبط یا بازتوزیع نکنید/);
  assert.match(onboarding, /شماره تلفن، شناسه شبکه اجتماعی/);
  assert.match(onboarding, /محتوای جنسی/);
  assert.match(onboarding, /«عادی» شما الزاماً «عادی» او نیست/);
  assert.match(onboarding, /دین یا بی‌دینی/);
  assert.match(onboarding, /مهاجرت/);
});

test('Listener safety teaching separates ending, blocking and reporting without fake Web actions', () => {
  assert.match(onboarding, /«یکی هست» سرویس پاسخ اضطراری نیست/);
  assert.match(onboarding, /پایان معمولی/);
  assert.match(onboarding, /مرزبندی/);
  assert.match(onboarding, /پایان ایمنی/);
  assert.match(onboarding, /مسدودسازی/);
  assert.match(onboarding, /گزارش:/);
  assert.match(onboarding, /پایان‌دادن یا مسدودسازی، خودبه‌خود گزارش ثبت نمی‌کند/);
  assert.match(onboarding, /گزارش برای ثبت رفتار جهت بررسی پلتفرم است/);
  assert.match(onboarding, /نتیجه یا مجازات خاصی را تضمین نمی‌کند/);
  assert.match(onboarding, /شما مسئول حل زندگی کاربر نیستید/);
  assert.doesNotMatch(onboarding, /safety\/report|reportCallSafety|listener\/report/);
});

test('Listener training avoids work-console terminology and incomplete custom tabs', () => {
  assert.doesNotMatch(onboarding, /\bPause\b|\bOffline\b|خروج امن \+ بلاک/);
  assert.doesNotMatch(onboarding, /role="tablist"|role="tab"|role="tabpanel"|aria-selected/);
  assert.match(onboarding, /aria-pressed=\{active\}/);
  assert.match(onboarding, /aria-labelledby=\{`training-module-heading-/);
});

test('Listener assessment and KYC copy stay user-facing rather than auditor-facing', () => {
  assert.match(onboarding, /درخواست شما در وضعیت فعلی تأیید نشده است/);
  assert.match(onboarding, /در حال حاضر امکان ارسال دوباره از این صفحه وجود ندارد/);
  assert.match(onboarding, /بعد از ارسال، ارزیابی در انتظار نتیجه می‌ماند/);
  assert.match(onboarding, /تا وقتی نتیجه اعلام نشده، نیازی به ارسال دوباره نیست/);
  assert.match(onboarding, /فرستادن فرم به معنی تأیید فوری نیست/);
  assert.match(onboarding, /به معنی فعال‌بودن فوری پرداخت، تسویه یا دریافت تماس نیست/);
  assert.doesNotMatch(onboarding, /سیستم ثابت نکرده|اطلاعاتی که این مرحله به آن متکی است/);
  assert.doesNotMatch(onboarding, /ظرف \d+ (ساعت|روز)/);
  assert.doesNotMatch(onboarding, /رمزنگاری‌شده|رمزگذاری‌شده/);
});

test('Listener KYC API contract remains unchanged', () => {
  assert.match(onboarding, /api<KycStatus>\('listener\/kyc'\)/);
  assert.match(onboarding, /api\('listener\/kyc', \{/);
  assert.match(onboarding, /legalName: legalName\.trim\(\)/);
  assert.match(onboarding, /nationalId: normalizedNationalId/);
  assert.match(onboarding, /dateOfBirthJalali: normalizedBirth/);
  assert.match(onboarding, /bankIban: normalizedIban/);
  assert.match(onboarding, /bankAccountHolder: accountHolder\.trim\(\) \|\| undefined/);
  assert.match(onboarding, /در پروفایل عمومی نمایش داده نمی‌شود/);
  assert.match(onboarding, /ثبت اطلاعات برای بررسی/);
});

test('Listener training keeps page-scoped progressive mobile styling', () => {
  assert.match(onboarding, /import styles from '\.\/listener\.module\.css'/);
  assert.match(onboarding, /activeModule/);
  assert.match(scopedStyles, /\.moduleTabs/);
  assert.match(scopedStyles, /@media \(max-width: 520px\)/);
});
