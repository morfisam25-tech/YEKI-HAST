'use client';

import { useEffect, useState } from 'react';

type Application = { status: string };

type AgreementResponse = {
  ok: true;
  applicationId: string;
  status: string;
  idempotent: boolean;
  agreementVersion: string;
};

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
    authentication_required: 'برای ادامه ابتدا وارد حساب شو.',
    listener_application_not_found: 'درخواست شنونده پیدا نشد.',
    listener_agreement_not_available: 'این مرحله هنوز برای درخواست باز نشده است.',
    listener_agreement_not_accepted: 'برای ادامه باید پذیرش صریح را علامت بزنی.',
    listener_kyc_incomplete: 'بررسی‌های لازم KYC هنوز کامل نشده‌اند.',
    listener_agreement_evidence_missing: 'مدرک پذیرش قبلی پیدا نشد؛ عملیات متوقف شد.',
    backend_unavailable: 'ارتباط با سرویس اصلی برقرار نشد.',
  };
  return messages[code] ?? `عملیات انجام نشد: ${code}`;
}

export default function ListenerAgreementPage() {
  const [application, setApplication] = useState<Application | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState<AgreementResponse | null>(null);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setApplication(await api<Application>('listener/application'));
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function acceptAgreement() {
    if (!accepted || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<AgreementResponse>('listener/agreement', {
        method: 'POST',
        body: JSON.stringify({ accepted: true }),
      });
      setDone(result);
      setApplication({ status: result.status });
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally {
      setBusy(false);
    }
  }

  const alreadyPastAgreement = application && ['admin_review', 'approved', 'active'].includes(application.status);
  const ready = application && ['agreement_pending', 'kyc_pending'].includes(application.status);

  return (
    <main className="listener-onboarding-page">
      <header className="site-header">
        <a className="brand" href="/">یکی هست</a>
        <a href="/listener">برگشت به مسیر شنونده</a>
      </header>

      <section className="call-setup wide-card onboarding-card" aria-labelledby="agreement-title">
        <p className="kicker">مرحله قرارداد / قوانین شنونده</p>
        <h1 id="agreement-title">پذیرش صریح قوانین فعلی</h1>
        <p className="helper">
          متن حقوقی تازه‌ای در این مرحله ساخته نشده است. پذیرش به نسخه فعلی «قوانین استفاده» با شناسه terms-2026-09-13 ثبت می‌شود و همراه حساب نگهداری می‌شود.
        </p>
        <p><a href="/terms" target="_blank" rel="noreferrer">خواندن قوانین استفاده، نسخه terms-2026-09-13</a></p>

        {busy && !application && <p className="helper">در حال خواندن وضعیت واقعی درخواست…</p>}
        {error && <p className="error" role="alert">{error}</p>}

        {done || alreadyPastAgreement ? (
          <div className="status-notice">
            <strong>پذیرش ثبت شده است.</strong>
            <span>درخواست اکنون در بررسی نهایی ادمین است. این صفحه امکان تأیید نهایی یا ساخت پروفایل شنونده را ندارد.</span>
            <p><a href="/listener">دیدن وضعیت درخواست</a></p>
          </div>
        ) : ready ? (
          <>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                style={{ marginTop: 5 }}
              />
              <span>نسخه terms-2026-09-13 را خوانده‌ام و قوانین مربوط به فعالیت به‌عنوان شنونده را می‌پذیرم.</span>
            </label>
            <button type="button" disabled={!accepted || busy} onClick={() => void acceptAgreement()}>
              {busy ? 'در حال ثبت…' : 'ثبت پذیرش و ارسال برای بررسی نهایی'}
            </button>
          </>
        ) : application ? (
          <div className="status-notice warning-notice">
            <strong>این مرحله هنوز باز نیست.</strong>
            <span>وضعیت فعلی درخواست: {application.status}</span>
            <p><a href="/listener">برگشت به مسیر شنونده</a></p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
