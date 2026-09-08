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
      setError('یک ایمیل معتبر وارد کنید.');
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
      if (!response.ok) throw new Error('email_otp_verify_failed');
      setStep('verified');
    } catch {
      setError('کد واردشده معتبر نیست یا زمان آن گذشته است.');
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
        <span>گفت‌وگو با یک آدم واقعی</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="kicker">برای وقتی که می‌خواهی حرف بزنی</p>
          <h1 id="page-title">یکی هست</h1>
          <p className="lead">
            در نسخه فعلی، ورود با ایمیل و مسیر درخواست شنونده فعال است. تماس صوتی و پرداخت هنوز برای استفاده عمومی
            باز نشده‌اند و فقط پس از تکمیل بررسی‌های فنی و سرویس‌های بیرونی لازم فعال می‌شوند.
          </p>

          <div className="after-login">
            <h2>بعد از ورود چه می‌بینی؟</h2>
            <p>
              بعد از ورود، مسیرهای موجود را می‌بینی: می‌توانی مسیر گفت‌وگو را بررسی کنی یا درخواست شنونده‌شدن
              بدهی. بعضی قابلیت‌ها تا زمان تکمیل بررسی‌های فنی و سرویس‌های بیرونی لازم بسته می‌مانند؛ وضعیت آن‌ها
              از روی حساب و سرور واقعی خوانده می‌شود.
            </p>
          </div>
        </div>

        <div className="login-panel" aria-live="polite">
          {step === 'email' && (
            <form onSubmit={requestCode} className="login-form">
              <div>
                <p className="form-eyebrow">ورود امن</p>
                <h2>ورود با ایمیل</h2>
                <p className="helper">یک کد یک‌بارمصرف ۶ رقمی به ایمیل شما فرستاده می‌شود.</p>
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
                ایمیل برای ورود و امنیت حساب استفاده می‌شود. تماس اصلی از اینترنت انجام می‌شود و شماره تلفن
                برای آن لازم نیست. اگر مسیر تلفنی جایگزین بعداً فعال شود، شماره تماس جداگانه ثبت و تأیید می‌شود.
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="login-form">
              <div>
                <p className="form-eyebrow">تأیید ایمیل</p>
                <h2>کد یک‌بارمصرف</h2>
                <p className="helper">کد ۶ رقمی ایمیل‌شده را وارد کنید.</p>
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
              <button type="button" className="text-button" onClick={editEmail} disabled={busy}>
                تغییر ایمیل
              </button>
            </form>
          )}

          {step === 'verified' && (
            <div className="verified-state">
              <p className="form-eyebrow">ورود انجام شد</p>
              <h2>ایمیل شما تأیید شد.</h2>
              <p className="helper">نشست ورود به‌صورت امن در cookie غیرقابل‌دسترسی برای JavaScript نگهداری می‌شود.</p>
              <a className="primary-link" href="/talk">دیدن مسیر گفت‌وگو</a>
              <a className="primary-link" href="/listener">درخواست شنونده‌شدن</a>
              <button type="button" className="text-button" onClick={() => void logout()}>خروج از این نشست</button>
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
          درخواست، آموزش، ارزیابی و تأییدهای شنونده بخشی از محصول‌اند. در پروفایل عمومی باید اطلاعات تأییدشده
          از معرفی، سابقه تحصیل یا کارِ خوداظهاری جدا دیده شود تا کاربر بداند کدام بخش را «یکی هست» بررسی کرده است.
        </p>
      </section>

      <nav className="public-links" aria-label="اطلاعات عمومی سرویس">
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
        <a href="mailto:sales@uniqueholding.com.tr">پشتیبانی</a>
      </nav>
    </main>
  );
}
