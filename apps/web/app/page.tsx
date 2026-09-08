'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

type Step = 'email' | 'code' | 'verified';

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function postJson(path: string, body: Record<string, string>): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default function Page() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError('ایمیل را کامل و درست وارد کنید.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/auth/request', { email: normalized });
      if (!response.ok) throw new Error('email_otp_request_failed');
      setVerifiedEmail(normalized);
      setStep('code');
    } catch {
      setError('کد ورود ارسال نشد. چند لحظه دیگر دوباره تلاش کنید.');
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
      if (!response.ok) throw new Error('email_otp_verify_failed');
      setStep('verified');
    } catch {
      setError('این کد معتبر نیست یا زمان استفاده از آن گذشته است. یک کد تازه بگیرید.');
    } finally {
      setBusy(false);
    }
  }

  function editEmail() {
    setCode('');
    setError('');
    setStep('email');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCode('');
    setVerifiedEmail('');
    setError('');
    setStep('email');
  }

  return (
    <main>
      <header className="site-header">
        <strong className="brand">یکی هست</strong>
        <span>یک انسان، برای شنیدن</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="kicker">گاهی فقط می‌خواهی کسی واقعاً گوش بدهد</p>
          <h1 id="page-title">یکی هست</h1>
          <p className="lead">
            «یکی هست» فضایی برای گفت‌وگوی محترمانه با یک شنونده انسانی است؛ کسی که با توجه گوش می‌دهد، قضاوت نمی‌کند و قرار نیست برای زندگی شما نسخه بپیچد.
          </p>

          <div className="after-login">
            <h2>شنونده چه کار می‌کند؟</h2>
            <p>
              شنونده به شما فرصت حرف‌زدن می‌دهد، سؤال‌های روشن و محترمانه می‌پرسد و کمک می‌کند حرفتان را با ریتم خودتان ادامه دهید. این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست.
            </p>
          </div>

          <div className="after-login">
            <h2>وضعیت فعلی سرویس</h2>
            <p>
              مسیر ثبت‌نام، آموزش و ارزیابی شنونده‌ها فعال است. گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده و تا زمان فعال‌شدن، از این صفحه وعده دسترسی به آن داده نمی‌شود.
            </p>
          </div>
        </div>

        <div className="login-panel" aria-live="polite">
          {step === 'email' && (
            <form onSubmit={requestCode} className="login-form">
              <div>
                <p className="form-eyebrow">ورود به حساب</p>
                <h2>ایمیل شما</h2>
                <p className="helper">یک کد ۶ رقمی برای ورود به همین ایمیل می‌فرستیم.</p>
              </div>

              <label htmlFor="email">ایمیل</label>
              <input
                id="email"
                name="email"
                aria-label="ایمیل"
                autoComplete="email"
                inputMode="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                dir="ltr"
              />

              {error && <p className="error" role="alert">{error}</p>}

              <button type="submit" disabled={busy}>
                {busy ? 'در حال ارسال…' : 'دریافت کد ورود'}
              </button>

              <p className="privacy">
                ایمیل برای ورود و امنیت حساب استفاده می‌شود. جزئیات مربوط به نگهداری و استفاده از داده‌ها در صفحه حریم خصوصی آمده است.
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="login-form">
              <div>
                <p className="form-eyebrow">تأیید ایمیل</p>
                <h2>کد ورود</h2>
                <p className="helper">کد ۶ رقمی ارسال‌شده به {verifiedEmail} را وارد کنید.</p>
              </div>

              <label htmlFor="code">کد ۶ رقمی</label>
              <input
                id="code"
                name="code"
                className="code-input"
                aria-label="کد ورود"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="------"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={busy}
              />

              {error && <p className="error" role="alert">{error}</p>}

              <button type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'در حال بررسی…' : 'تأیید و ورود'}
              </button>
              <button type="button" className="text-button" onClick={editEmail} disabled={busy}>
                اصلاح ایمیل
              </button>
            </form>
          )}

          {step === 'verified' && (
            <div className="verified-state">
              <p className="form-eyebrow">ورود انجام شد</p>
              <h2>حساب شما آماده ادامه است.</h2>
              <p className="helper">اگر برای شنونده‌شدن آمده‌اید، از همین‌جا وارد مسیر آموزش و ارزیابی شوید.</p>
              <a className="primary-link" href="/listener">ادامه مسیر شنونده</a>
              <button type="button" className="text-button" onClick={() => void logout()}>خروج از حساب</button>
            </div>
          )}
        </div>
      </section>

      <section className="listener-note" aria-labelledby="listener-title">
        <div>
          <p className="kicker">برای شنونده‌ها</p>
          <h2 id="listener-title">شنیدن خوب، مهارت و مرز می‌خواهد.</h2>
        </div>
        <p>
          متقاضی شنونده‌شدن قبل از آماده‌شدن، با نقش شنونده، گوش‌دادن فعال، مرزهای رفتاری و موقعیت‌های حساس آشنا می‌شود و بعد ارزیابی می‌شود. اطلاعاتی که خود فرد درباره خودش می‌نویسد با اطلاعاتی که واقعاً بررسی شده یکسان در نظر گرفته نمی‌شود.
        </p>
      </section>

      <section className="listener-note" aria-labelledby="trust-title">
        <div>
          <p className="kicker">اعتماد و حریم</p>
          <h2 id="trust-title">احترام، بخشی از خود گفتگوست.</h2>
        </div>
        <p>
          گفت‌وگو باید در چارچوب هدف «یکی هست»، یعنی شنیدن و همراهی انسانی، باقی بماند. آزار، تهدید، درخواست‌های نامناسب، سوءاستفاده از اطلاعات شخصی یا تلاش برای بردن رابطه به خارج از سرویس پذیرفته نیست. جزئیات بیشتر در قوانین استفاده و حریم خصوصی آمده است.
        </p>
      </section>

      <nav className="public-links" aria-label="اطلاعات عمومی سرویس">
        <a href="/listener">شنونده‌شدن</a>
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
        <a href="mailto:sales@uniqueholding.com.tr">sales@uniqueholding.com.tr</a>
      </nav>
    </main>
  );
}
