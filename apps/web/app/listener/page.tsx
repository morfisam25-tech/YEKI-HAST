'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type TrainingModuleKey = 'active_listening' | 'role_boundary' | 'safety' | 'platform_rules';
type Gender = 'female' | 'male';
type KycState = 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';

type BootstrapLanguage = { code: string; nameFa: string; nameEn: string | null };
type Bootstrap = { languages: BootstrapLanguage[] };

type Application = {
  id: string;
  status: string;
  nickname: string;
  declared_gender: Gender;
  short_intro: string | null;
  listening_style: string | null;
  created_at: string;
  languages: Array<{ code: string; proficiency: string }>;
  training: Array<{
    module_key: TrainingModuleKey;
    status: string;
    progress_percent: number;
    completed_at: string | null;
  }>;
  trainingComplete: boolean;
  latestAssessment: null | {
    id: string;
    result: 'pending' | 'passed' | 'failed';
    score: string | null;
    scenario_version: string;
    created_at: string;
  };
};

type KycStatus = {
  applicationStatus: string;
  status: KycState;
  verifiedAt: string | null;
  rejectedReasonCode: string | null;
  updatedAt: string | null;
};

const trainingModules: Array<{ key: TrainingModuleKey; title: string; body: string }> = [
  {
    key: 'active_listening',
    title: '۱. گوش‌دادن فعال',
    body: 'قرار نیست سریع راه‌حل بدهی. اول گوش می‌دهی، حرف طرف مقابل را می‌فهمی و با سؤال طبیعی کمک می‌کنی خودش ادامه بدهد.',
  },
  {
    key: 'role_boundary',
    title: '۲. مرز نقش',
    body: 'تو درمانگر، پزشک یا مشاور حقوقی نیستی. تشخیص نمی‌دهی، نسخه نمی‌پیچی و خودت را متخصص معرفی نمی‌کنی.',
  },
  {
    key: 'safety',
    title: '۳. ایمنی',
    body: 'اگر مکالمه شامل تهدید، آزار، رفتار جنسی یا وضعیت ناامن شد، از خروج امن و گزارش داخل سرویس استفاده می‌کنی. در خطر فوری، سرویس جایگزین خدمات اضطراری نیست.',
  },
  {
    key: 'platform_rules',
    title: '۴. قوانین پلتفرم',
    body: 'قرار عاشقانه، سکس‌چت، درخواست شماره یا آیدی شخصی و انتقال رابطه به خارج از پلتفرم مجاز نیست.',
  },
];

const questions = [
  {
    key: 'q_listening',
    text: 'Caller می‌گوید: «فقط می‌خوام یکی گوش بده.» بهترین واکنش کدام است؟',
    choices: [
      ['listen', '«باشه، من اینجام. از هرجا راحتی شروع کن.»'],
      ['diagnose', '«احتمالاً افسردگی داری.»'],
    ],
  },
  {
    key: 'q_contact',
    text: 'Caller از تو شماره یا آیدی شخصی می‌خواهد. چه می‌کنی؟',
    choices: [
      ['decline_contact', 'محترمانه رد می‌کنم و مکالمه را داخل پلتفرم نگه می‌دارم.'],
      ['share_contact', 'اگر آدم خوبی بود شماره‌ام را می‌دهم.'],
    ],
  },
  {
    key: 'q_boundary',
    text: 'Caller از تو تشخیص پزشکی یا روان‌شناختی قطعی می‌خواهد. چه می‌کنی؟',
    choices: [
      ['no_diagnosis', 'می‌گویم این خارج از نقش من است و تشخیص نمی‌دهم.'],
      ['give_diagnosis', 'بر اساس تجربه شخصی تشخیص می‌دهم.'],
    ],
  },
] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/listener/${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `http_${response.status}`);
  if (!body) throw new Error('invalid_response');
  return body;
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'برای ادامه ابتدا از صفحه اصلی وارد حساب شو.',
    listener_application_not_found: 'درخواست شنونده هنوز ساخته نشده است.',
    application_locked: 'این درخواست وارد مرحله بعد شده و دیگر قابل ویرایش نیست.',
    unknown_language: 'یکی از زبان‌های انتخاب‌شده معتبر نیست.',
    training_locked: 'مرحله آموزش برای این درخواست بسته شده است.',
    invalid_training_module: 'بخش آموزش معتبر نیست.',
    training_incomplete: 'اول هر چهار بخش آموزش را کامل کن.',
    assessment_pending_review: 'آزمون قبلی هنوز در حال بررسی است.',
    assessment_locked: 'مرحله آزمون برای این درخواست بسته شده است.',
    kyc_not_configured: 'ثبت امن اطلاعات هویتی در این محیط هنوز فعال نشده است.',
    kyc_not_available: 'مرحله احراز هویت هنوز برای این درخواست باز نشده است.',
    kyc_already_verified: 'احراز هویت قبلاً تأیید شده است.',
    invalid_legal_name: 'نام و نام خانوادگی را مطابق مدرک وارد کن.',
    invalid_national_id: 'کد ملی معتبر نیست.',
    invalid_date_of_birth: 'تاریخ تولد شمسی معتبر نیست.',
    date_of_birth_mismatch: 'تاریخ تولد با اطلاعات قبلی همخوان نیست.',
    invalid_bank_iban: 'شماره شبا معتبر نیست.',
    national_id_already_registered: 'این کد ملی قبلاً برای حساب دیگری ثبت شده است.',
    kyc_identity_conflict: 'اطلاعات هویتی با حساب دیگری تداخل دارد.',
    backend_unavailable: 'ارتباط با سرویس اصلی برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره تلاش کن.';
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    exploring: 'در حال شروع',
    training: 'آموزش',
    assessment: 'آزمون',
    assessment_pending: 'آزمون در انتظار بررسی',
    assessment_passed: 'آزمون تأیید شده',
    kyc_pending: 'احراز هویت در انتظار بررسی',
    kyc_expired: 'احراز هویت نیاز به ثبت دوباره دارد',
    agreement_pending: 'در انتظار قرارداد',
    admin_review: 'در بررسی نهایی',
    mock_call: 'در مرحله تماس آزمایشی',
    approved: 'تأییدشده برای کار',
    active: 'فعال',
    suspended: 'معلق',
    rejected: 'ردشده',
    archived: 'بایگانی‌شده',
  };
  return labels[status] ?? status;
}

export default function ListenerOnboardingPage() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [applicationMissing, setApplicationMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [shortIntro, setShortIntro] = useState('');
  const [listeningStyle, setListeningStyle] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busyModule, setBusyModule] = useState<TrainingModuleKey | null>(null);

  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [legalName, setLegalName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [birthJalali, setBirthJalali] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  const loadApplication = useCallback(async () => {
    try {
      const value = await api<Application>('listener/application');
      setApplication(value);
      setApplicationMissing(false);
      return value;
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'listener_application_not_found') {
        setApplication(null);
        setApplicationMissing(true);
        return null;
      }
      throw cause;
    }
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [bootstrapResult, app] = await Promise.all([
        api<Bootstrap>('bootstrap'),
        loadApplication(),
      ]);
      setBootstrap(bootstrapResult);
      if (!selectedLanguages.length && bootstrapResult.languages.length) {
        const preferred = bootstrapResult.languages.find((item) => item.code === 'fa') ?? bootstrapResult.languages[0];
        setSelectedLanguages([preferred.code]);
      }
      if (app && ['assessment_passed', 'kyc_pending', 'kyc_expired', 'approved', 'active'].includes(app.status)) {
        try { setKycStatus(await api<KycStatus>('listener/kyc')); }
        catch (cause) {
          if (!(cause instanceof Error && cause.message === 'kyc_not_available')) throw cause;
        }
      }
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'load_failed'));
    } finally {
      setLoading(false);
    }
  }, [loadApplication, selectedLanguages.length]);

  useEffect(() => {
    void refresh();
  }, []);

  const completedModules = useMemo(
    () => new Set(
      application?.training
        .filter((item) => item.status === 'completed' && item.progress_percent === 100)
        .map((item) => item.module_key) ?? [],
    ),
    [application],
  );

  const allAnswered = questions.every((question) => Boolean(answers[question.key]));
  const canCreateApplication = nickname.trim().length >= 2 && gender !== null && selectedLanguages.length > 0;
  const normalizedNationalId = normalizeDigits(nationalId).replace(/\D/g, '').slice(0, 10);
  const normalizedBirth = normalizeDigits(birthJalali).replace(/[/.]/g, '-').replace(/[^\d-]/g, '').slice(0, 10);
  const normalizedIban = normalizeDigits(iban).replace(/[\s-]/g, '').toUpperCase().slice(0, 26);
  const canSubmitKyc = legalName.trim().length >= 2
    && /^\d{10}$/.test(normalizedNationalId)
    && /^\d{4}-\d{2}-\d{2}$/.test(normalizedBirth)
    && /^IR\d{24}$/.test(normalizedIban);

  function toggleLanguage(code: string) {
    setSelectedLanguages((current) => {
      if (current.includes(code)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== code);
      }
      return [...current, code];
    });
  }

  async function createApplication() {
    if (!canCreateApplication || busy || !gender) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('listener/application', {
        method: 'POST',
        body: JSON.stringify({
          nickname: nickname.trim(),
          gender,
          shortIntro: shortIntro.trim() || undefined,
          listeningStyle: listeningStyle.trim() || undefined,
          languages: selectedLanguages.map((code) => ({ code, proficiency: 'fluent' })),
        }),
      });
      await loadApplication();
      setNotice('درخواست ساخته شد. حالا آموزش کوتاه شنونده را کامل کن.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'application_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function completeModule(moduleKey: TrainingModuleKey) {
    if (busyModule || completedModules.has(moduleKey)) return;
    setBusyModule(moduleKey);
    setError('');
    setNotice('');
    try {
      await api('listener/training/complete', {
        method: 'POST',
        body: JSON.stringify({ moduleKey }),
      });
      await loadApplication();
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'training_failed'));
    } finally {
      setBusyModule(null);
    }
  }

  async function submitAssessment() {
    if (!allAnswered || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('listener/assessment', {
        method: 'POST',
        body: JSON.stringify({ scenarioVersion: 'listener-beta-v1', answers }),
      });
      await loadApplication();
      setNotice('آزمون ثبت شد. نتیجه فقط بعد از بررسی واقعی تغییر می‌کند.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'assessment_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function loadKyc() {
    setBusy(true);
    setError('');
    try {
      setKycStatus(await api<KycStatus>('listener/kyc'));
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'kyc_load_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function submitKyc() {
    if (!canSubmitKyc || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('listener/kyc', {
        method: 'POST',
        body: JSON.stringify({
          legalName: legalName.trim(),
          nationalId: normalizedNationalId,
          dateOfBirthJalali: normalizedBirth,
          bankIban: normalizedIban,
          bankAccountHolder: accountHolder.trim() || undefined,
        }),
      });
      setKycStatus(await api<KycStatus>('listener/kyc'));
      await loadApplication();
      setLegalName('');
      setNationalId('');
      setBirthJalali('');
      setIban('');
      setAccountHolder('');
      setNotice('اطلاعات هویتی برای بررسی واقعی ثبت شد. این داده‌ها در پروفایل عمومی نمایش داده نمی‌شوند.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'kyc_submit_failed'));
    } finally {
      setBusy(false);
    }
  }

  const appReadyForWork = application && ['approved', 'active'].includes(application.status);
  const needsKyc = application && ['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(application.status);
  const onboardingMutable = application && ['exploring', 'training', 'assessment'].includes(application.status);
  const reviewOnly = application && !appReadyForWork && !needsKyc && !onboardingMutable;
  const assessment = application?.latestAssessment ?? null;

  return (
    <main className="listener-onboarding-page">
      <header className="site-header">
        <a className="brand" href="/">یکی هست</a>
        <span>مسیر شنونده · Web/PWA</span>
      </header>

      <section className="listener-onboarding-hero">
        <div>
          <p className="kicker">شنونده</p>
          <h1>از ثبت‌نام تا آماده‌شدن برای کار</h1>
        </div>
        <p>
          این مسیر همان قواعد نسخه موبایل را روی Web اجرا می‌کند: معرفی عمومی با نام مستعار، آموزش نقش و ایمنی، آزمون سناریویی و سپس احراز هویت خصوصی. هیچ مرحله‌ای صرفاً با کلیک کاربر «تأییدشده» اعلام نمی‌شود.
        </p>
      </section>

      {loading && <p className="helper">در حال خواندن وضعیت واقعی حساب…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="helper" aria-live="polite">{notice}</p>}

      {!loading && applicationMissing && bootstrap && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="profile-title">
          <div>
            <p className="kicker">مرحله ۱</p>
            <h2 id="profile-title">پروفایل عمومی اولیه</h2>
          </div>
          <p className="helper">نام واقعی، کد ملی و اطلاعات بانکی در این مرحله خواسته نمی‌شود. متن معرفی و سبک گوش‌دادن خوداظهاری‌اند و تا زمانی که فیلدی جداگانه تأیید نشود، «تأییدشده» محسوب نمی‌شوند.</p>

          <label htmlFor="listener-nickname">نام مستعار</label>
          <input id="listener-nickname" value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 80))} placeholder="مثلاً نازنین" />

          <span className="field-label">جنسیت اعلامی</span>
          <div className="duration-options two-column">
            <button type="button" className={gender === 'female' ? 'selected' : ''} onClick={() => setGender('female')}>زن</button>
            <button type="button" className={gender === 'male' ? 'selected' : ''} onClick={() => setGender('male')}>مرد</button>
          </div>

          <span className="field-label">زبان‌هایی که برای مکالمه می‌پذیری</span>
          <div className="language-grid">
            {bootstrap.languages.map((language) => (
              <button
                type="button"
                className={selectedLanguages.includes(language.code) ? 'selected language-button' : 'language-button'}
                key={language.code}
                onClick={() => toggleLanguage(language.code)}
              >
                {language.nameFa}{language.nameEn ? ` · ${language.nameEn}` : ''}
              </button>
            ))}
          </div>

          <label htmlFor="listener-intro">معرفی کوتاه خوداظهاری</label>
          <textarea id="listener-intro" value={shortIntro} onChange={(event) => setShortIntro(event.target.value.slice(0, 400))} rows={4} placeholder="چند جمله کوتاه درباره خودت و نوع گفت‌وگویی که دوست داری…" />

          <label htmlFor="listener-style">سبک گوش‌دادن خوداظهاری</label>
          <textarea id="listener-style" value={listeningStyle} onChange={(event) => setListeningStyle(event.target.value.slice(0, 400))} rows={3} placeholder="مثلاً آرام، سؤال‌محور، بدون نصیحت…" />

          <button type="button" disabled={!canCreateApplication || busy} onClick={() => void createApplication()}>
            {busy ? 'در حال ثبت…' : 'ساخت درخواست شنونده'}
          </button>
        </section>
      )}

      {!loading && application && onboardingMutable && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="training-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="kicker">مرحله ۲</p>
              <h2 id="training-title">آموزش و آزمون</h2>
            </div>
            <span className="presence-pill">{statusLabel(application.status)}</span>
          </div>
          <p className="helper">چهار بخش را بخوان و تکمیل کن. نتیجه آزمون فقط از وضعیت واقعی سرور خوانده می‌شود.</p>

          <div className="training-grid">
            {trainingModules.map((module) => {
              const done = completedModules.has(module.key);
              return (
                <article className={done ? 'training-card training-card-done' : 'training-card'} key={module.key}>
                  <h3>{module.title}</h3>
                  <p>{module.body}</p>
                  <button type="button" disabled={done || busyModule !== null} onClick={() => void completeModule(module.key)}>
                    {done ? '✓ کامل شد' : busyModule === module.key ? 'در حال ثبت…' : 'خواندم و متوجه شدم'}
                  </button>
                </article>
              );
            })}
          </div>

          {application.trainingComplete && (!assessment || assessment.result === 'failed') && (
            <div className="assessment-panel">
              <h3>آزمون سناریویی</h3>
              {questions.map((question) => (
                <fieldset className="question-card" key={question.key}>
                  <legend>{question.text}</legend>
                  {question.choices.map(([value, label]) => (
                    <label className="answer-choice" key={value}>
                      <input
                        type="radio"
                        name={question.key}
                        value={value}
                        checked={answers[question.key] === value}
                        onChange={() => setAnswers((current) => ({ ...current, [question.key]: value }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <button type="button" disabled={!allAnswered || busy} onClick={() => void submitAssessment()}>
                {busy ? 'در حال ارسال…' : 'ارسال آزمون برای بررسی'}
              </button>
            </div>
          )}

          {assessment?.result === 'pending' && (
            <div className="status-notice">
              <strong>آزمون ثبت شده است.</strong>
              <span>در انتظار بررسی واقعی. احراز هویت تا قبل از قبولی باز نمی‌شود.</span>
            </div>
          )}
          {assessment?.result === 'failed' && (
            <div className="status-notice warning-notice">
              <strong>این تلاش قبول نشده است.</strong>
              <span>درخواست بسته نشده. برای تلاش بعدی، آموزش و مرزبندی نقش را دوباره مرور کن.</span>
            </div>
          )}
          {assessment?.result === 'passed' && (
            <div className="status-notice">
              <strong>آزمون تأیید شده است.</strong>
              <span>برای بازکردن مرحله احراز هویت وضعیت را تازه کن.</span>
            </div>
          )}

          <button type="button" className="text-button" onClick={() => void refresh()}>تازه‌سازی وضعیت واقعی</button>
        </section>
      )}

      {!loading && application && needsKyc && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="kyc-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="kicker">مرحله ۳</p>
              <h2 id="kyc-title">احراز هویت خصوصی</h2>
            </div>
            <span className="presence-pill">{statusLabel(application.status)}</span>
          </div>
          <p className="helper">این اطلاعات فقط برای احراز، قرارداد و پرداخت نزد سرویس می‌ماند و برای Caller یا پروفایل عمومی نمایش داده نمی‌شود. ثبت فرم به معنی تأیید نیست.</p>

          {!kycStatus && (
            <button type="button" disabled={busy} onClick={() => void loadKyc()}>{busy ? 'در حال بررسی…' : 'بررسی آمادگی احراز هویت'}</button>
          )}

          {kycStatus?.status === 'pending' && (
            <div className="status-notice">
              <strong>اطلاعات ثبت شده است.</strong>
              <span>وضعیت: در انتظار بررسی واقعی.</span>
            </div>
          )}

          {kycStatus?.status === 'verified' && (
            <div className="status-notice">
              <strong>احراز هویت تأیید شده است.</strong>
              <span>اگر حساب هنوز Approved نشده، مرحله بررسی نهایی/قرارداد باقی مانده است.</span>
            </div>
          )}

          {kycStatus && ['not_started', 'rejected', 'expired'].includes(kycStatus.status) && (
            <div className="kyc-form">
              {(kycStatus.status === 'rejected' || kycStatus.status === 'expired') && (
                <p className="error">اطلاعات قبلی نیاز به ثبت دوباره دارد{kycStatus.rejectedReasonCode ? ` · ${kycStatus.rejectedReasonCode}` : ''}.</p>
              )}

              <label htmlFor="legal-name">نام و نام خانوادگی مطابق مدرک</label>
              <input id="legal-name" autoComplete="name" value={legalName} onChange={(event) => setLegalName(event.target.value.slice(0, 140))} />

              <label htmlFor="national-id">کد ملی</label>
              <input id="national-id" inputMode="numeric" autoComplete="off" value={nationalId} onChange={(event) => setNationalId(event.target.value)} placeholder="۱۰ رقم" />

              <label htmlFor="birth-jalali">تاریخ تولد شمسی</label>
              <input id="birth-jalali" inputMode="numeric" autoComplete="off" value={birthJalali} onChange={(event) => setBirthJalali(event.target.value)} placeholder="مثلاً ۱۳۷۰-۰۵-۲۱" />

              <label htmlFor="iban">شماره شبا</label>
              <input id="iban" dir="ltr" autoComplete="off" value={iban} onChange={(event) => setIban(event.target.value)} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" />

              <label htmlFor="account-holder">نام صاحب حساب، اگر متفاوت است</label>
              <input id="account-holder" value={accountHolder} onChange={(event) => setAccountHolder(event.target.value.slice(0, 140))} />

              <button type="button" disabled={!canSubmitKyc || busy} onClick={() => void submitKyc()}>
                {busy ? 'در حال ثبت امن…' : 'ثبت برای استعلام واقعی'}
              </button>
            </div>
          )}

          <button type="button" className="text-button" onClick={() => void refresh()}>تازه‌سازی وضعیت</button>
        </section>
      )}

      {!loading && application && reviewOnly && (
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

      {!loading && appReadyForWork && (
        <section className="call-setup wide-card onboarding-card ready-card" aria-labelledby="ready-title">
          <p className="kicker">آماده کار</p>
          <h2 id="ready-title">حساب شنونده برای حالت کاری آماده است.</h2>
          <p className="helper">Online شدن هنوز به معنی Push پس‌زمینه نیست. در Web، تا زمان آماده‌شدن اعلان واقعی باید تب حالت کاری باز و فعال بماند.</p>
          <a className="primary-link" href="/listener/work">بازکردن حالت کاری شنونده</a>
        </section>
      )}

      <nav className="public-links" aria-label="مسیرهای مرتبط">
        <a href="/">خانه</a>
        <a href="/listener/work">حالت کاری</a>
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
      </nav>
    </main>
  );
}
