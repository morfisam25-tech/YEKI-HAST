'use client';

import { useEffect, useState } from 'react';

type Summary = {
  generatedAt: string;
  counts: {
    applications: number;
    awaitingAssessment: number;
    kycPending: number;
    approvedListeners: number;
    onlineNow: number;
    liveCalls: number;
    safetyEvents: number;
    callerWaitlist: number;
    payoutsReady: number;
  };
};

type ApplicationListItem = {
  id: string;
  userId: string;
  status: string;
  nickname: string;
  gender: string;
  submittedAt: string | null;
  createdAt: string;
  latestAssessment: null | { id: string; result: string; score: number | null; createdAt: string };
};

type ApplicationDetail = ApplicationListItem & {
  shortIntro: string | null;
  listeningStyle: string | null;
  languages: Array<{ code: string; nameFa: string; proficiency: string }>;
  training: Array<{ module_key: string; status: string; progress_percent: number }>;
  assessments: Array<{
    id: string;
    result: string;
    score: number | null;
    scenarioVersion: string;
    answers: Record<string, unknown>;
    createdAt: string;
  }>;
};

type KycDetail = {
  applicationId: string;
  status: 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';
  rejectedReasonCode: string | null;
  verifiedAt: string | null;
  updatedAt: string | null;
  completeness: Record<string, boolean>;
};

const labels: Array<[keyof Summary['counts'], string]> = [
  ['applications', 'درخواست‌های شنونده'],
  ['awaitingAssessment', 'در انتظار بررسی آزمون'],
  ['kycPending', 'در مرحله احراز هویت'],
  ['approvedListeners', 'شنونده تأییدشده'],
  ['onlineNow', 'آنلاین همین حالا'],
  ['liveCalls', 'تماس فعال'],
  ['safetyEvents', 'رویداد ایمنی'],
  ['callerWaitlist', 'صف انتظار Caller'],
  ['payoutsReady', 'پرداخت آماده ارسال'],
];

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    invalid_email: 'ایمیل معتبر نیست.',
    invalid_otp: 'کد تأیید درست نیست یا منقضی شده.',
    otp_request_rate_limited: 'تعداد درخواست کد زیاد شده؛ بعداً دوباره امتحان کن.',
    email_delivery_unavailable: 'ارسال ایمیل ورود در دسترس نیست.',
    admin_required: 'این حساب دسترسی ادمین فعال ندارد.',
    unauthorized: 'نشست ادمین معتبر نیست.',
    assessment_already_reviewed: 'این آزمون قبلاً بررسی شده.',
    assessment_attempt_superseded: 'آزمون جدیدتری وجود دارد؛ این مورد قابل بررسی نیست.',
    application_not_in_assessment: 'درخواست دیگر در مرحله آزمون نیست.',
    kyc_already_verified: 'KYC قبلاً verified شده و review دستی مجاز نیست.',
    invalid_kyc_review_action: 'عملیات KYC مجاز نیست.',
  };
  return messages[code] ?? `درخواست انجام نشد: ${code}`;
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body;
}

export default function AdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [kyc, setKyc] = useState<KycDetail | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewScore, setReviewScore] = useState('100');
  const [kycReason, setKycReason] = useState('identity_review_required');

  async function loadSummary() {
    const value = await api('/api/summary') as unknown as Summary;
    setSummary(value);
  }

  async function loadApplications() {
    const value = await api('/api/ops/listener-applications?limit=50') as { applications: ApplicationListItem[] };
    setApplications(value.applications);
  }

  async function loadApplication(applicationId: string) {
    setBusy(true);
    setError('');
    try {
      const [detail, kycDetail] = await Promise.all([
        api(`/api/ops/listener-applications/${encodeURIComponent(applicationId)}`) as unknown as Promise<ApplicationDetail>,
        api(`/api/ops/listener-applications/${encodeURIComponent(applicationId)}/kyc`)
          .catch((cause) => {
            if (cause instanceof Error && cause.message === 'listener_application_not_found') return null;
            throw cause;
          }) as Promise<KycDetail | null>,
      ]);
      setSelected(detail);
      setKyc(kycDetail);
      const latest = detail.assessments[0];
      setReviewScore(latest?.score === null || latest?.score === undefined ? '100' : String(latest.score));
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function loadDashboard() {
    await Promise.all([loadSummary(), loadApplications()]);
  }

  useEffect(() => {
    loadDashboard()
      .catch(() => setSummary(null))
      .finally(() => setCheckingSession(false));
  }, []);

  async function requestCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
      setCodeSent(true);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally { setBusy(false); }
  }

  async function verifyCode() {
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
      await loadDashboard();
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally { setBusy(false); }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await loadDashboard();
      if (selected) await loadApplication(selected.id);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally { setBusy(false); }
  }

  async function reviewAssessment(result: 'passed' | 'failed') {
    const attempt = selected?.assessments[0];
    if (!attempt || attempt.result !== 'pending' || busy) return;
    const score = Number(reviewScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError('امتیاز باید بین ۰ تا ۱۰۰ باشد.');
      return;
    }
    if (!window.confirm(result === 'passed' ? 'قبولی این آزمون ثبت شود؟' : 'رد این آزمون ثبت شود؟')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/ops/listener-assessments/${encodeURIComponent(attempt.id)}/review`, {
        method: 'POST',
        body: JSON.stringify({ result, score }),
      });
      await loadDashboard();
      await loadApplication(selected.id);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally { setBusy(false); }
  }

  async function reviewKyc(action: 'reject' | 'expire') {
    if (!selected || !kyc || kyc.status === 'verified' || busy) return;
    const reasonCode = kycReason.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(reasonCode)) {
      setError('Reason code معتبر نیست.');
      return;
    }
    if (!window.confirm(action === 'reject' ? 'KYC رد شود؟' : 'KYC منقضی شود و نیاز به ارسال دوباره داشته باشد؟')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/ops/listener-applications/${encodeURIComponent(selected.id)}/kyc`, {
        method: 'POST',
        body: JSON.stringify({ action, reasonCode }),
      });
      await loadDashboard();
      await loadApplication(selected.id);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSummary(null);
    setApplications([]);
    setSelected(null);
    setKyc(null);
    setCode('');
    setCodeSent(false);
  }

  if (checkingSession) return <main><div className="panel"><h1>یکی هست / عملیات</h1><p>در حال بررسی نشست ادمین…</p></div></main>;

  if (!summary) {
    return (
      <main className="authShell">
        <section className="panel authPanel">
          <p className="kicker">YEKI HAST · ADMIN</p>
          <h1>ورود عملیات</h1>
          <p className="muted">ورود ادمین با Email OTP انجام می‌شود و فقط حساب دارای نقش ادمین فعال وارد می‌شود.</p>
          <label>ایمیل ادمین</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" type="email" autoComplete="email" inputMode="email" dir="ltr" />
          {!codeSent ? (
            <button disabled={busy || !email.trim()} onClick={requestCode}>{busy ? 'در حال ارسال…' : 'ارسال کد به ایمیل'}</button>
          ) : (
            <>
              <label>کد ۶ رقمی ایمیل‌شده</label>
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="------" inputMode="numeric" dir="ltr" />
              <button disabled={busy || code.length !== 6} onClick={verifyCode}>{busy ? 'در حال بررسی…' : 'ورود به پنل'}</button>
              <button className="ghost" disabled={busy} onClick={() => { setCodeSent(false); setCode(''); }}>تغییر ایمیل</button>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  const latestAssessment = selected?.assessments[0] ?? null;

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · OPERATIONS</p>
          <h1>یکی هست / عملیات</h1>
          <p className="muted">آخرین خواندن: {new Date(summary.generatedAt).toLocaleString('fa-IR')}</p>
        </div>
        <div className="actions">
          <button className="ghost" disabled={busy} onClick={refresh}>{busy ? 'در حال خواندن…' : 'به‌روزرسانی'}</button>
          <button className="danger" onClick={logout}>خروج</button>
        </div>
      </header>

      <section className="grid">
        {labels.map(([key, label]) => <article key={key}><small>{label}</small><strong>{summary.counts[key].toLocaleString('fa-IR')}</strong></article>)}
      </section>

      {error && <p className="error">{error}</p>}

      <section className="opsLayout">
        <div className="panel queuePanel">
          <div className="sectionHeader"><div><p className="kicker">LISTENER PIPELINE</p><h2>صف بررسی شنونده</h2></div><span>{applications.length.toLocaleString('fa-IR')} مورد</span></div>
          <div className="queue">
            {applications.map((item) => (
              <button key={item.id} className={`queueItem ${selected?.id === item.id ? 'active' : ''}`} onClick={() => loadApplication(item.id)}>
                <b>{item.nickname}</b>
                <span>{item.status}</span>
                <small>{item.latestAssessment ? `assessment: ${item.latestAssessment.result}` : 'بدون آزمون'}</small>
              </button>
            ))}
            {!applications.length && <p className="muted">درخواستی وجود ندارد.</p>}
          </div>
        </div>

        <div className="panel detailPanel">
          {!selected ? <p className="muted">یک درخواست را از صف انتخاب کن.</p> : (
            <>
              <div className="sectionHeader"><div><p className="kicker">APPLICATION</p><h2>{selected.nickname}</h2></div><span className="statusPill">{selected.status}</span></div>
              <div className="facts">
                <p><b>جنسیت:</b> {selected.gender}</p>
                <p><b>زبان:</b> {selected.languages.map((x) => `${x.nameFa} (${x.proficiency})`).join('، ') || '—'}</p>
                <p><b>Training:</b> {selected.training.filter((x) => x.status === 'completed').length}/{selected.training.length}</p>
              </div>

              {latestAssessment && (
                <section className="subPanel">
                  <h3>آخرین آزمون</h3>
                  <p className="muted">وضعیت: <b>{latestAssessment.result}</b> · نسخه: {latestAssessment.scenarioVersion}</p>
                  <pre>{JSON.stringify(latestAssessment.answers, null, 2)}</pre>
                  {latestAssessment.result === 'pending' && (
                    <div className="reviewRow">
                      <input value={reviewScore} onChange={(e) => setReviewScore(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" dir="ltr" aria-label="Assessment score" />
                      <button disabled={busy} onClick={() => reviewAssessment('passed')}>قبول</button>
                      <button className="danger" disabled={busy} onClick={() => reviewAssessment('failed')}>رد</button>
                    </div>
                  )}
                </section>
              )}

              <section className="subPanel">
                <div className="sectionHeader"><h3>KYC</h3><span className="statusPill">{kyc?.status ?? 'نامشخص'}</span></div>
                {kyc ? (
                  <>
                    <div className="facts compact">
                      {Object.entries(kyc.completeness).map(([key, value]) => <p key={key}>{value ? '✓' : '✕'} {key}</p>)}
                    </div>
                    {kyc.rejectedReasonCode && <p className="muted">Reason: {kyc.rejectedReasonCode}</p>}
                    {kyc.status === 'verified' ? (
                      <p className="safeNotice">Verified توسط جریان verification ثبت شده است. هیچ دکمه manual verify در پنل وجود ندارد.</p>
                    ) : kyc.status !== 'not_started' ? (
                      <div className="reviewRow wide">
                        <input value={kycReason} onChange={(e) => setKycReason(e.target.value)} dir="ltr" aria-label="KYC reason code" />
                        <button className="danger" disabled={busy} onClick={() => reviewKyc('reject')}>Reject</button>
                        <button className="ghost" disabled={busy} onClick={() => reviewKyc('expire')}>Expire</button>
                      </div>
                    ) : <p className="muted">KYC هنوز ارسال نشده است.</p>}
                  </>
                ) : <p className="muted">وضعیت KYC قابل خواندن نیست.</p>}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}