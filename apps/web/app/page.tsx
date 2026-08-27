'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

type Step = 'phone' | 'code' | 'verified';

function normalizeIranPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return `+98${digits.slice(1)}`;
  if (/^989\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

async function postJson(path: string, body: Record<string, string>): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default function Page() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeIranPhone(phone);
    if (!normalized) {
      setError('شماره موبایل را به شکل ۰۹xxxxxxxxx وارد کنید.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/v1/auth/otp/request', { phone: normalized });
      if (!response.ok) throw new Error('otp_request_failed');
      setPhoneE164(normalized);
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
      setError('کد ۶ رقمی پیامک‌شده را وارد کنید.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/v1/auth/otp/verify', { phone: phoneE164, code });
      if (!response.ok) throw new Error('otp_verify_failed');
      setStep('verified');
    } catch {
      setError('کد واردشده معتبر نیست یا زمان آن گذشته است.');
    } finally {
      setBusy(false);
    }
  }

  function editPhone() {
    setCode('');
    setError('');
    setStep('phone');
  }

  return (
    <main>
      <header className="site-header">
        <strong className="brand">یکی هست</strong>
        <span>گفت‌وگو با یک آدم واقعی</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="kicker">برای وقتی که می‌خواهی حرف بزنی</p>
          <h1 id="page-title">یکی هست</h1>
          <p className="lead">
            سرویسی برای گفت‌وگوی صوتی با شنونده‌های انسانی تأییدشده؛ برای زمانی که
            می‌خواهی حرف بزنی، درد دل کنی یا یک گفت‌وگوی واقعی داشته باشی.
          </p>

          <div className="after-login">
            <h2>بعد از ورود چه اتفاقی می‌افتد؟</h2>
            <p>
              مسیر متناسب با نقش شما ادامه پیدا می‌کند: کاربرانِ دارای دسترسی فعال
              می‌توانند مسیر گفت‌وگو را دنبال کنند و متقاضیان شنوندگی، درخواست و
              آموزش خود را تکمیل می‌کنند.
            </p>
          </div>
        </div>

        <div className="login-panel" aria-live="polite">
          {step === 'phone' && (
            <form onSubmit={requestCode} className="login-form">
              <div>
                <p className="form-eyebrow">ورود امن</p>
                <h2>ورود با شماره موبایل</h2>
                <p className="helper">
                  برای تأیید شماره موبایل، یک کد یک‌بارمصرف برای شما پیامک می‌شود.
                </p>
              </div>

              <label htmlFor="phone">شماره موبایل</label>
              <input
                id="phone"
                name="phone"
                aria-label="شماره موبایل"
                autoComplete="tel"
                inputMode="tel"
                placeholder="۰۹xxxxxxxxx"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={busy}
              />

              {error && <p className="error" role="alert">{error}</p>}

              <button type="submit" disabled={busy}>
                {busy ? 'در حال ارسال…' : 'دریافت کد ورود'}
              </button>

              <p className="privacy">
                شماره موبایل شما برای ورود و امنیت حساب استفاده می‌شود و به شنونده
                نمایش داده نمی‌شود.
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="login-form">
              <div>
                <p className="form-eyebrow">تأیید شماره موبایل</p>
                <h2>کد یک‌بارمصرف</h2>
                <p className="helper">کد ۶ رقمی پیامک‌شده را وارد کنید.</p>
              </div>

              <label htmlFor="code">کد ورود</label>
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
              <button type="button" className="text-button" onClick={editPhone} disabled={busy}>
                تغییر شماره موبایل
              </button>
            </form>
          )}

          {step === 'verified' && (
            <div className="verified-state">
              <p className="form-eyebrow">ورود انجام شد</p>
              <h2>شماره موبایل شما تأیید شد.</h2>
              <p className="helper">
                حساب شما آماده است تا در مسیر فعال محصول ادامه بدهید.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="listener-note" aria-labelledby="listener-title">
        <div>
          <p className="kicker">مسیر شنونده</p>
          <h2 id="listener-title">شنونده‌ها پیش از فعالیت بررسی می‌شوند.</h2>
        </div>
        <p>
          متقاضی شنوندگی پس از ورود، درخواست و آموزش را تکمیل می‌کند. نمایش شنونده
          در سرویس به تأییدهای تعریف‌شده در محصول وابسته است.
        </p>
      </section>
    </main>
  );
}
