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
      setError('ایمیل حساب را کامل و درست وارد کنید.');
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
      setError('کد تأیید ارسال نشد. چند لحظه دیگر دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('کد ۶ رقمی ارسال‌شده به ایمیل را وارد کنید.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/auth/verify', { email: verifiedEmail, code });
      if (!response.ok) throw new Error('verify_failed');
      setStep('confirm');
    } catch {
      setError('این کد معتبر نیست یا زمان استفاده از آن گذشته است. یک کد تازه بگیرید.');
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation.trim() !== 'حذف حساب') {
      setError('برای ادامه، عبارت «حذف حساب» را دقیق وارد کنید.');
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
        ? 'برای امنیت حساب، تأیید قبلی منقضی شده است. دوباره از ایمیل شروع کنید.'
        : 'درخواست حذف انجام نشد. کمی بعد دوباره تلاش کنید.');
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
        <a href="/">بازگشت به صفحه اصلی</a>
      </header>

      <section className="intro" aria-labelledby="delete-title">
        <div className="intro-copy">
          <p className="kicker">حساب کاربری</p>
          <h1 id="delete-title">حذف حساب</h1>
          <p className="lead">
            این فرایند برای حذف حساب است، نه خروج ساده از حساب. ابتدا مالکیت ایمیل را با کد یک‌بارمصرف تأیید می‌کنیم. در مرحله آخر باید عبارت «حذف حساب» را خودتان وارد و درخواست را ارسال کنید.
          </p>
          <div className="after-login">
            <h2>بعد از ارسال درخواست چه می‌شود؟</h2>
            <p>
              با پذیرش درخواست، همه نشست‌های فعال این حساب لغو می‌شوند. اگر سابقه‌ای وجود نداشته باشد که مانع حذف فوری شود، حذف کامل همان لحظه انجام می‌شود. اگر سابقه مالی، تماس، ایمنی یا داده عملیاتی دیگری به بررسی نگهداری نیاز داشته باشد، نشست‌ها لغو می‌شوند اما حساب تا زمانی که حذف واقعاً کامل نشده باشد «حذف‌شده» اعلام نمی‌شود.
            </p>
            <p>
              در حالت حذف کامل، داده‌های وابسته‌ای که برای نگهداری لازم نیستند حذف می‌شوند. یک رکورد حداقلی و بدون پیوند مستقیم به هویت می‌تواند برای ثبت نتیجه حذف باقی بماند. برای پرسش درباره داده یا وضعیت حذف، از <a href="mailto:sales@uniqueholding.com.tr">پشتیبانی</a> استفاده کنید.
            </p>
          </div>
        </div>

        <div className="login-panel" aria-live="polite">
          {step === 'email' && (
            <form onSubmit={requestCode} className="login-form">
              <div>
                <p className="form-eyebrow">مرحله ۱ از ۳</p>
                <h2>ایمیل حساب</h2>
                <p className="helper">کد ۶ رقمی تأیید به همین ایمیل فرستاده می‌شود.</p>
              </div>
              <label htmlFor="email">ایمیل</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                dir="ltr"
              />
              {error && <p className="error" role="alert">{error}</p>}
              <button type="submit" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال کد تأیید'}</button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="login-form">
              <div>
                <p className="form-eyebrow">مرحله ۲ از ۳</p>
                <h2>تأیید ایمیل</h2>
                <p className="helper">کد ارسال‌شده به {verifiedEmail} را وارد کنید.</p>
              </div>
              <label htmlFor="code">کد ۶ رقمی</label>
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
              <button type="button" className="text-button" onClick={editEmail} disabled={busy}>اصلاح ایمیل</button>
            </form>
          )}

          {step === 'confirm' && (
            <form onSubmit={requestDeletion} className="login-form">
              <div>
                <p className="form-eyebrow">مرحله ۳ از ۳</p>
                <h2>تأیید نهایی حذف</h2>
                <p className="helper">
                  با ارسال این درخواست، نشست‌های فعال حساب لغو می‌شوند. حذف فیزیکی حساب فقط وقتی همان لحظه کامل اعلام می‌شود که سامانه واقعاً آن را انجام داده باشد؛ در غیر این صورت درخواست برای بررسی نگهداری باقی می‌ماند.
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
                {busy ? 'در حال انجام…' : 'حذف حساب'}
              </button>
            </form>
          )}

          {step === 'completed' && (
            <div className="verified-state">
              <p className="form-eyebrow">حذف کامل شد</p>
              <h2>حساب شما حذف شد.</h2>
              <p className="helper">
                سامانه حذف کامل را تأیید کرده است. نشست‌های حساب لغو شده‌اند و رکورد اصلی حساب و داده‌های وابسته‌ای که نگهداری آن‌ها لازم نبود حذف شده‌اند. برای استفاده دوباره از «یکی هست» باید حساب تازه‌ای بسازید.
              </p>
              <a href="/">بازگشت به صفحه اصلی</a>
            </div>
          )}

          {step === 'requested' && (
            <div className="verified-state">
              <p className="form-eyebrow">درخواست ثبت شد</p>
              <h2>حذف هنوز کامل نشده است.</h2>
              <p className="helper">
                نشست‌های فعال حساب لغو شده‌اند، اما یک یا چند سابقه مانع حذف فوری شده‌اند و درخواست نیاز به بررسی نگهداری دارد. این وضعیت به معنی حذف کامل حساب نیست.
              </p>
              <p className="helper">
                برای پرسش درباره این وضعیت می‌توانید به <a href="mailto:sales@uniqueholding.com.tr">sales@uniqueholding.com.tr</a> ایمیل بزنید.
              </p>
              <a href="/">بازگشت به صفحه اصلی</a>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
