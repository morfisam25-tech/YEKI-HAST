from pathlib import Path

api_path = Path('services/api/src/routes/listener.ts')
api = api_path.read_text()
old_api = """    if (!listenerTrainingComplete(progress.rows)) throw new HttpError(409, 'training_incomplete');

    const attempt = await client.query<{ id: string }>(`
      INSERT INTO app.listener_assessment_attempts(application_id, result, scenario_version, answers)
"""
new_api = """    if (!listenerTrainingComplete(progress.rows)) throw new HttpError(409, 'training_incomplete');

    const pending = await client.query(`
      SELECT 1
      FROM app.listener_assessment_attempts
      WHERE application_id=$1 AND result='pending'
      LIMIT 1
    `, [row.id]);
    if (pending.rowCount) throw new HttpError(409, 'assessment_pending_review');

    const attempt = await client.query<{ id: string }>(`
      INSERT INTO app.listener_assessment_attempts(application_id, result, scenario_version, answers)
"""
if old_api not in api:
    raise SystemExit('assessment insertion target not found')
api_path.write_text(api.replace(old_api, new_api, 1))

web_path = Path('apps/web/app/listener/page.tsx')
web = web_path.read_text()

old_labels = """    kyc_expired: 'احراز هویت نیاز به ثبت دوباره دارد',
    approved: 'تأییدشده برای کار',
    active: 'فعال',
    rejected: 'ردشده',
"""
new_labels = """    kyc_expired: 'احراز هویت نیاز به ثبت دوباره دارد',
    agreement_pending: 'در انتظار قرارداد',
    admin_review: 'در بررسی نهایی',
    mock_call: 'در مرحله تماس آزمایشی',
    approved: 'تأییدشده برای کار',
    active: 'فعال',
    suspended: 'معلق',
    rejected: 'ردشده',
    archived: 'بایگانی‌شده',
"""
if old_labels not in web:
    raise SystemExit('status label target not found')
web = web.replace(old_labels, new_labels, 1)

old_state = """  const appReadyForWork = application && ['approved', 'active'].includes(application.status);
  const needsKyc = application && ['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(application.status);
  const assessment = application?.latestAssessment ?? null;
"""
new_state = """  const appReadyForWork = application && ['approved', 'active'].includes(application.status);
  const needsKyc = application && ['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(application.status);
  const onboardingMutable = application && ['exploring', 'training', 'assessment'].includes(application.status);
  const reviewOnly = application && !appReadyForWork && !needsKyc && !onboardingMutable;
  const assessment = application?.latestAssessment ?? null;
"""
if old_state not in web:
    raise SystemExit('state classifier target not found')
web = web.replace(old_state, new_state, 1)

old_training = "      {!loading && application && !appReadyForWork && !needsKyc && (\n"
new_training = "      {!loading && application && onboardingMutable && (\n"
if old_training not in web:
    raise SystemExit('training render target not found')
web = web.replace(old_training, new_training, 1)

old_retry = "          {application.trainingComplete && !assessment && (\n"
new_retry = "          {application.trainingComplete && (!assessment || assessment.result === 'failed') && (\n"
if old_retry not in web:
    raise SystemExit('failed assessment retry target not found')
web = web.replace(old_retry, new_retry, 1)

anchor = "      {!loading && appReadyForWork && (\n"
review_card = """      {!loading && application && reviewOnly && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="review-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="kicker">وضعیت درخواست</p>
              <h2 id="review-title">این مرحله از داخل Web قابل تغییر نیست.</h2>
            </div>
            <span className="presence-pill">{statusLabel(application.status)}</span>
          </div>
          <p className="helper">
            {application.status === 'rejected'
              ? 'درخواست در وضعیت ردشده است. آموزش یا آزمون دوباره فقط وقتی باید باز شود که سرور صریحاً درخواست را به مرحله قابل‌ویرایش برگرداند.'
              : application.status === 'suspended'
                ? 'حساب فعلاً معلق است. Web اجازه Online شدن یا بازنویسی مراحل قبلی را از این صفحه نمی‌دهد.'
                : 'درخواست وارد مرحله بررسی، قرارداد یا فرایند نهایی شده است. تا وقتی وضعیت واقعی سرور تغییر نکند، مراحل قبلی دوباره قابل ثبت نیستند.'}
          </p>
          <button type="button" className="text-button" onClick={() => void refresh()}>تازه‌سازی وضعیت واقعی</button>
        </section>
      )}

"""
if anchor not in web:
    raise SystemExit('review-only insertion anchor not found')
web_path.write_text(web.replace(anchor, review_card + anchor, 1))

test_path = Path('tests/listener-assessment-state-guard.test.ts')
test_path.write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const listenerRoute = await readFile(new URL('../services/api/src/routes/listener.ts', import.meta.url), 'utf8');
const webOnboarding = await readFile(new URL('../apps/web/app/listener/page.tsx', import.meta.url), 'utf8');

test('listener assessment API allows only one pending review per application', () => {
  assert.match(listenerRoute, /WHERE application_id=\\$1 AND result='pending'/);
  assert.match(listenerRoute, /assessment_pending_review/);
  assert.match(listenerRoute, /FOR UPDATE/);
});

test('Web Listener permits a new assessment after a real failed review', () => {
  assert.match(webOnboarding, /!assessment \\|\\| assessment\\.result === 'failed'/);
  assert.match(webOnboarding, /ارسال آزمون برای بررسی/);
});

test('Web Listener keeps non-onboarding application states fail-closed', () => {
  assert.match(webOnboarding, /\\['exploring', 'training', 'assessment'\\]\\.includes\\(application\\.status\\)/);
  assert.match(webOnboarding, /reviewOnly/);
  assert.match(webOnboarding, /agreement_pending: 'در انتظار قرارداد'/);
  assert.match(webOnboarding, /admin_review: 'در بررسی نهایی'/);
  assert.match(webOnboarding, /suspended: 'معلق'/);
  assert.match(webOnboarding, /این مرحله از داخل Web قابل تغییر نیست/);
});
""")
