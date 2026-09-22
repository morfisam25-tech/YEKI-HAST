'use client';

import { useEffect, useMemo, useState } from 'react';

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
  languages: Array<{ code: string; nameFa: string; nameEn: string | null; proficiency: string }>;
  training: Array<{ module_key: string; status: string; progress_percent: number; completed_at: string | null }>;
  assessments: Array<{
    id: string;
    result: string;
    score: number | null;
    scenarioVersion: string;
    reviewedByUserId: string | null;
    reviewedAt: string | null;
    createdAt: string;
  }>;
};

type KycCheck = {
  checkKind: string;
  status: string;
  provider: string | null;
  providerReference: string | null;
  failureCode: string | null;
  requestedAt: string | null;
  resolvedAt: string | null;
};

type KycDetail = {
  applicationId: string;
  userId: string;
  applicationStatus: string;
  status: 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';
  rejectedReasonCode: string | null;
  verifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completeness: Record<string, boolean>;
  checks: KycCheck[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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

function fmt(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('fa-IR') : value;
}

function checkLabel(kind: string): string {
  if (kind === 'national_id_dob_match') return 'تطبیق کد ملی و تاریخ تولد';
  if (kind === 'iban_inquiry') return 'استعلام شبا';
  return kind;
}

function checkResult(status: string): string {
  const labels: Record<string, string> = {
    not_checked: 'بررسی نشده',
    pending: 'در حال بررسی',
    verified: 'این بررسی مشخص با موفقیت انجام شده',
    failed: 'عدم تطابق/نتیجه منفی همین بررسی',
    error: 'خطای سرویس؛ نتیجه نامشخص',
  };
  return labels[status] ?? status;
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ادمین معتبر نیست. از داشبورد عملیات دوباره وارد شو.',
    admin_required: 'این حساب دسترسی ادمین ندارد.',
    listener_application_not_in_admin_review: 'این درخواست در مرحله بررسی نهایی نیست.',
    listener_kyc_incomplete: 'همه بررسی‌های الزامی KYC کامل نشده‌اند.',
    listener_agreement_required: 'مدرک پذیرش قوانین شنونده وجود ندارد.',
    listener_assessment_not_passed: 'آزمون شنونده قبولی ثبت‌شده ندارد.',
    listener_application_rejected: 'این درخواست قبلاً رد شده است.',
    listener_application_already_approved: 'این درخواست قبلاً تأیید شده است.',
  };
  return messages[code] ?? `عملیات انجام نشد: ${code}`;
}

export default function ListenerApprovalsPage() {
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [kyc, setKyc] = useState<KycDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');

  async function loadList() {
    const result = await api<{ applications: ApplicationListItem[] }>('/api/ops/listener-applications?limit=100');
    setApplications(result.applications);
  }

  async function loadApplication(id: string) {
    setBusy(true);
    setError('');
    try {
      const [detail, kycDetail] = await Promise.all([
        api<ApplicationDetail>(`/api/ops/listener-applications/${encodeURIComponent(id)}`),
        api<KycDetail>(`/api/ops/listener-applications/${encodeURIComponent(id)}/kyc`),
      ]);
      setSelected(detail);
      setKyc(kycDetail);
      setReason('');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      await loadList();
      if (selected) await loadApplication(selected.id);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
      setBusy(false);
    }
  }

  useEffect(() => {
    loadList()
      .catch((cause) => setError(messageFor(cause instanceof Error ? cause.message : 'request_failed')))
      .finally(() => setBusy(false));
  }, []);

  async function decide(decision: 'approve' | 'reject') {
    if (!selected || selected.status !== 'admin_review' || busy) return;
    if (decision === 'reject' && !reason.trim()) {
      setError('برای رد درخواست، دلیل کوتاه و مشخص وارد کن.');
      return;
    }
    const prompt = decision === 'approve'
      ? 'این شنونده پس از بررسی evidence موجود برای کار تأیید شود؟'
      : 'این درخواست رد شود؟';
    if (!window.confirm(prompt)) return;

    setBusy(true);
    setError('');
    try {
      await api(`/api/ops/listener-applications/${encodeURIComponent(selected.id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
      });
      await loadList();
      await loadApplication(selected.id);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
      setBusy(false);
    }
  }

  const requiredChecksComplete = useMemo(
    () => Boolean(kyc && kyc.checks.length >= 2 && kyc.checks.every((check) => check.status === 'verified')),
    [kyc],
  );
  const canDecide = selected?.status === 'admin_review';

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">LISTENER APPROVALS</p>
          <h1>بررسی و تأیید شنونده</h1>
          <p className="muted">این صفحه فقط evidence موجود را نشان می‌دهد. هیچ عبارت کلی «هویت تأیید شد» تولید نمی‌کند.</p>
        </div>
        <div className="actions">
          <button className="ghost" disabled={busy} onClick={() => void refresh()}>{busy ? 'در حال خواندن…' : 'به‌روزرسانی'}</button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="opsLayout">
        <div className="panel queuePanel">
          <div className="sectionHeader">
            <div><p className="kicker">APPLICATIONS</p><h2>درخواست‌ها</h2></div>
            <span>{applications.length.toLocaleString('fa-IR')}</span>
          </div>
          <div className="queue">
            {applications.map((item) => (
              <button
                key={item.id}
                className={`queueItem ${selected?.id === item.id ? 'active' : ''}`}
                onClick={() => void loadApplication(item.id)}
              >
                <b>{item.nickname}</b>
                <span>{item.status}</span>
                <small>{item.latestAssessment ? `assessment: ${item.latestAssessment.result}` : 'بدون آزمون'}</small>
              </button>
            ))}
            {!applications.length && !busy && <p className="muted">درخواستی وجود ندارد.</p>}
          </div>
        </div>

        <div className="panel detailPanel">
          {!selected ? <p className="muted">یک درخواست را انتخاب کن.</p> : (
            <>
              <div className="sectionHeader">
                <div><p className="kicker">APPLICANT</p><h2>{selected.nickname}</h2></div>
                <span className="statusPill">{selected.status}</span>
              </div>

              <div className="facts">
                <p><b>User:</b> <span dir="ltr">{selected.userId}</span></p>
                <p><b>مرحله فعلی:</b> {selected.status}</p>
                <p><b>جنسیت اعلامی:</b> {selected.gender}</p>
                <p><b>زبان‌ها:</b> {selected.languages.map((item) => `${item.nameFa} (${item.proficiency})`).join('، ') || '—'}</p>
                <p><b>ارسال درخواست:</b> {fmt(selected.submittedAt)}</p>
                <p><b>آخرین آزمون:</b> {selected.assessments[0] ? `${selected.assessments[0].result} · ${selected.assessments[0].score ?? 'بدون امتیاز'} · ${fmt(selected.assessments[0].reviewedAt)}` : '—'}</p>
              </div>

              <section className="subPanel">
                <div className="sectionHeader">
                  <div><p className="kicker">FIELD-LEVEL KYC EVIDENCE</p><h3>بررسی‌های KYC</h3></div>
                  <span className="statusPill">{requiredChecksComplete ? 'بررسی‌های الزامی کامل' : 'ناقص / در انتظار'}</span>
                </div>

                {kyc ? (
                  <>
                    <div className="facts compact">
                      <p><b>ثبت داده:</b> {fmt(kyc.createdAt)}</p>
                      <p><b>آخرین تغییر:</b> {fmt(kyc.updatedAt)}</p>
                      {Object.entries(kyc.completeness).map(([key, value]) => (
                        <p key={key}>{value ? '✓' : '✕'} داده لازم موجود: {key}</p>
                      ))}
                    </div>

                    {kyc.checks.map((check) => (
                      <article className="subPanel" key={check.checkKind}>
                        <h3>{checkLabel(check.checkKind)}</h3>
                        <div className="facts compact">
                          <p><b>Provider:</b> {check.provider ?? '—'}</p>
                          <p><b>نتیجه:</b> {checkResult(check.status)}</p>
                          <p><b>درخواست:</b> {fmt(check.requestedAt)}</p>
                          <p><b>پاسخ:</b> {fmt(check.resolvedAt)}</p>
                          <p><b>Provider reference:</b> {check.providerReference ?? '—'}</p>
                          <p><b>Failure code:</b> {check.failureCode ?? '—'}</p>
                        </div>
                      </article>
                    ))}
                    {!kyc.checks.length && <p className="muted">هیچ بررسی provider-level ثبت نشده است.</p>}
                  </>
                ) : <p className="muted">KYC قابل خواندن نیست.</p>}
              </section>

              <section className="subPanel">
                <h3>تصمیم نهایی</h3>
                {canDecide ? (
                  <>
                    <p className="muted">Approve فقط در backend و پس از بازبینی دوباره قبولی آزمون، evidence KYC و پذیرش قوانین انجام می‌شود. ساخت/فعال‌سازی پروفایل هم در همان transaction است.</p>
                    <label htmlFor="listener-rejection-reason">دلیل رد، فقط برای تصمیم Reject</label>
                    <textarea
                      id="listener-rejection-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value.slice(0, 500))}
                      rows={3}
                      placeholder="مثلاً evidence کافی نیست یا نیاز به بررسی مجدد"
                    />
                    <div className="reviewRow wide">
                      <button disabled={busy || !requiredChecksComplete} onClick={() => void decide('approve')}>Approve for work</button>
                      <button className="danger" disabled={busy || !reason.trim()} onClick={() => void decide('reject')}>Reject</button>
                    </div>
                  </>
                ) : (
                  <p className="muted">برای وضعیت {selected.status} تصمیم نهایی از این صفحه مجاز نیست.</p>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
