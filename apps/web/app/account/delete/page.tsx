'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

type Step = 'email' | 'code' | 'confirm' | 'completed' | 'requested';

type DeletionResponse = {
  deletionCompleted?: boolean;
  reviewRequired?: boolean;
};

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function postJson(path: string, body?: Record<string, string>): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default function DeleteAccountPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError('یک ایمیل معتبر وارد کنید.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/auth/request', { email: normalized });
      if (!response.ok) throw new Error('request_failed');
      setVerifiedEmail(normalized);
      setStep('code');
    } catch {
      setError('ارسال کد انجام نشد. کمی بعد دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('کد ۶ رقمی ایمیل‌شده را وارد کنید.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/auth/verify', { email: verifiedEmail, code });
      if (!response.ok) throw new Error('verify_failed');
      setStep('confirm');
    } catch {
      setError('کد واردشده معتبر نیست یا زمان آن گذشته است.');
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation.trim() !== 'حذف حساب') {
      setError('برای تأیید، عبارت «حذف حساب» را دقیق وارد کنید.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/account/deletion-request');
      if (!response.ok && response.status !== 202) {
        if (response.status === 401) {
          setStep('email');
          throw new Error('session_expired');
        }
        throw new Error('delete_request_failed');
      }
      const payload = await response.json() as DeletionResponse;
      setStep(payload.deletionCompleted ? 'completed' : 'requested');
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'session_expired'
        ? 'نشست منقضی شده است. دوباره با ایمیل وارد شوید.'
        : 'حذف حساب انجام نشد. کمی بعد دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  function editEmail() {
    setCode('');
    setConfirmation('');
    setError('');
    setStep('email');
  }

  return (
    <main>
      <header className="site-header">
        <strong className="brand">یکی هست</strong>
        <a href="/">برگشت به صفحه اصلی</a>
      </header>

      <section className="intro" aria-labelledby="delete-title">
        <div className="intro-copy">
          <p className="kicker">مدیریت حساب</p>
          <h1 id="delete-title">حذف حساب</h1>
          <p className="lead">
            برای حذف حساب، ابتدا مالکیت ایمیل را با کد یک‌بارمصرف تأیید کنید.
            حساب‌های فاقد سابقه‌ای که نگهداری آن ضروری است همان‌جا حذف می‌شوند و همه نشست‌ها بسته می‌شوند.
          </p>
          <div className="after-login">
            <h2>درباره فرایند حذف</h2>
            <p>
              اگر سابقه‌ای وجود داشته باشد که نگهداری آن برای تسویه مالی، ایمنی، رسیدگی به گزارش‌ها یا الزام معتبر دیگری
              ضروری است، نشست‌ها فوراً باطل می‌شوند و درخواست برای بررسی نگهداری ضروری ثبت می‌شود. سیستم فقط وقتی
              «حذف کامل شد» را نمایش می‌دهد که حذف واقعی حساب انجام شده باشد.
            </p>
          </div>
        </div>

        <div className="login-panel" aria-live="polite">
          {step === 'email' && (
            <form onSubmit={requestCode} className="login-form">
              <div>
                <p className="form-eyebrow">تأیید مالک حساب</p>
                <h2>ایمیل حساب</h2>
                <p className="helper">کد ۶ رقمی به همین ایمیل ارسال می‌شود.</p>
              </div>
              <label htmlFor="email">ایمیل</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                dir="ltr"
              />
              {error && <p className="error" role="alert">{error}</p>}
              <button type="submit" disabled={busy}>{busy ? 'در حال ارسال…' : 'دریافت کد'}</button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="login-form">
              <div>
                <p className="form-eyebrow">تأیید ایمیل</p>
                <h2>کد یک‌بارمصرف</h2>
                <p className="helper">کد ارسال‌شده به {verifiedEmail} را وارد کنید.</p>
              </div>
              <label htmlFor="code">کد ورود</label>
              <input
                id="code"
                className="code-input"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={busy}
              />
              {error && <p className="error" role="alert">{error}</p>}
              <button type="submit" disabled={busy || code.length !== 6}>{busy ? 'در حال بررسی…' : 'تأیید ایمیل'}</button>
              <button type="button" className="text-button" onClick={editEmail} disabled={busy}>تغییر ایمیل</button>
            </form>
          )}

          {step === 'confirm' && (
            <form onSubmit={requestDeletion} className="login-form">
              <div>
                <p className="form-eyebrow">مرحله نهایی</p>
                <h2>حذف حساب</h2>
                <p className="helper">
                  با تأیید این مرحله، سیستم حذف واقعی حساب را همان لحظه انجام می‌دهد؛ فقط سوابقی که به دلیل معتبر قابل حذف فوری نیستند وارد بررسی نگهداری می‌شوند.
                </p>
              </div>
              <label htmlFor="confirmation">برای تأیید بنویسید: حذف حساب</label>
              <input
                id="confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
                autoComplete="off"
              />
              {error && <p className="error" role="alert">{error}</p>}
              <button type="submit" disabled={busy || confirmation.trim() !== 'حذف حساب'}>
                {busy ? 'در حال حذف…' : 'حذف حساب'}
              </button>
            </form>
          )}

          {step === 'completed' && (
            <div className="verified-state">
              <p className="form-eyebrow">حذف انجام شد</p>
              <h2>حساب حذف شد.</h2>
              <p className="helper">
                شناسه‌های ورود، نشست‌ها و داده‌های وابسته‌ای که نگهداری آن‌ها لازم نبود حذف شدند. برای استفاده دوباره باید حساب تازه‌ای بسازید.
              </p>
              <a href="/">برگشت به صفحه اصلی</a>
            </div>
          )}

          {step === 'requested' && (
            <div className="verified-state">
              <p className="form-eyebrow">درخواست ثبت شد</p>
              <h2>نشست‌های حساب بسته شدند.</h2>
              <p className="helper">
                یک یا چند سابقه نیازمند بررسی نگهداری است. حساب دیگر نشست فعال ندارد و درخواست حذف برای تکمیل فرایند ثبت شده است.
              </p>
              <a href="/">برگشت به صفحه اصلی</a>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
