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
    invalid_phone: 'شماره موبایل معتبر نیست.',
    invalid_otp: 'کد تأیید درست نیست یا منقضی شده.',
    otp_request_rate_limited: 'تعداد درخواست کد زیاد شده؛ بعداً دوباره امتحان کن.',
    sms_delivery_unavailable: 'ارسال پیامک در دسترس نیست.',
    admin_required: 'این حساب دسترسی ادمین فعال ندارد.',
    unauthorized: 'نشست ادمین معتبر نیست.',
  };
  return messages[code] ?? 'درخواست انجام نشد.';
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
  const [checkingSession, setCheckingSession] = useState(true);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadSummary() {
    const value = await api('/api/summary') as unknown as Summary;
    setSummary(value);
  }

  useEffect(() => {
    loadSummary()
      .catch(() => setSummary(null))
      .finally(() => setCheckingSession(false));
  }, []);

  async function requestCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/request', { method: 'POST', body: JSON.stringify({ phone }) });
      setCodeSent(true);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ phone, code }) });
      await loadSummary();
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await loadSummary(); }
    catch (cause) { setError(messageFor(cause instanceof Error ? cause.message : 'request_failed')); }
    finally { setBusy(false); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSummary(null);
    setCode('');
    setCodeSent(false);
  }

  if (checkingSession) {
    return <main><div className="panel"><h1>یکی هست / عملیات</h1><p>در حال بررسی نشست ادمین…</p></div></main>;
  }

  if (!summary) {
    return (
      <main className="authShell">
        <section className="panel authPanel">
          <p className="kicker">YEKI HAST · ADMIN</p>
          <h1>ورود عملیات</h1>
          <p className="muted">ورود با همان OTP اصلی انجام می‌شود. فقط حسابی که در سیستم نقش ادمین فعال دارد وارد پنل می‌شود.</p>
          <label>شماره موبایل</label>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0912..." inputMode="tel" dir="ltr" />
          {!codeSent ? (
            <button disabled={busy || phone.trim().length < 8} onClick={requestCode}>{busy ? 'در حال ارسال…' : 'ارسال کد'}</button>
          ) : (
            <>
              <label>کد ۶ رقمی</label>
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="------" inputMode="numeric" dir="ltr" />
              <button disabled={busy || code.length !== 6} onClick={verifyCode}>{busy ? 'در حال بررسی…' : 'ورود به پنل'}</button>
              <button className="ghost" disabled={busy} onClick={() => { setCodeSent(false); setCode(''); }}>تغییر شماره</button>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

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
        {labels.map(([key, label]) => (
          <article key={key}>
            <small>{label}</small>
            <strong>{summary.counts[key].toLocaleString('fa-IR')}</strong>
          </article>
        ))}
      </section>

      {error && <p className="error">{error}</p>}

      <section className="panel">
        <h2>تعریف آمار</h2>
        <div className="definitions">
          <p><b>آنلاین همین حالا:</b> فقط Listener تأییدشده با KYC verified و heartbeat کمتر از ۹۰ ثانیه.</p>
          <p><b>تماس فعال:</b> sessionهایی که هنوز در مسیر اتصال یا connected هستند.</p>
          <p><b>پرداخت آماده ارسال:</b> payout با status=created؛ ارسال همچنان KYC verified می‌خواهد.</p>
          <p><b>رویداد ایمنی:</b> شمار کل safety eventهای ثبت‌شده؛ جزئیات حساس در این نمای خلاصه نمایش داده نمی‌شود.</p>
        </div>
      </section>
    </main>
  );
}
