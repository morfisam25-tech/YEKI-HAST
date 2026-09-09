'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import styles from './home.module.css';

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

const moments = [
  { title: 'وقتی ذهنت شلوغ است', text: 'لازم نیست اول حرف‌هایت را مرتب کنی.' },
  { title: 'وقتی دلت می‌خواهد شنیده شوی', text: 'می‌توانی از همان جایی شروع کنی که راحت‌تری.' },
  { title: 'وقتی راه‌حل نمی‌خواهی', text: 'فقط بگو فعلاً می‌خواهی کسی گوش بدهد.' },
];

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
      setError('ایمیل را کامل و درست وارد کن.');
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
      setError('کد ورود ارسال نشد. چند لحظه دیگر دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('کد ۶ رقمی ارسال‌شده به ایمیل را وارد کن.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await postJson('/api/auth/verify', { email: verifiedEmail, code });
      if (!response.ok) throw new Error('email_otp_verify_failed');
      setStep('verified');
    } catch {
      setError('این کد معتبر نیست یا زمان استفاده از آن گذشته است. یک کد تازه بگیر.');
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
    <main className={styles.home} dir="rtl">
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="صفحه اصلی یکی هست">
          <span className={styles.brandMark} aria-hidden="true">ی</span>
          <span>یکی هست</span>
        </a>

        <nav className={styles.headerNav} aria-label="ناوبری اصلی">
          <a href="#how-it-works">چطور کار می‌کند</a>
          <a href="#trust">امنیت</a>
          <a href="#login">ورود</a>
          <a className={styles.headerCta} href="/listener">شنونده شوید</a>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true">●</span> گفت‌وگو با یک آدم واقعی</p>
          <h1 id="page-title">گاهی فقط لازم است یکی واقعاً گوش بدهد.</h1>
          <p className={styles.heroLead}>
            با یک شنونده واقعی حرف بزن؛ بدون قضاوت و بدون اینکه مجبور باشی همه‌چیز را از اول توضیح بدهی.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#login">شروع با ایمیل <span aria-hidden="true">←</span></a>
            <a className={styles.textAction} href="#how-it-works">ببین چطور کار می‌کند <span aria-hidden="true">↓</span></a>
          </div>
          <p className={styles.availability}>
            گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده. ورود با ایمیل و مسیر شنونده‌شدن در دسترس است.
          </p>
        </div>

        <div className={styles.heroVisual} aria-label="پیش‌نمایش تجربه شنیدن">
          <div className={styles.photoFrame}>
            <img src="/hero-listening.webp" alt="دو نفر در حال گفت‌وگویی آرام و محترمانه" />
            <div className={styles.photoCaption}>
              <span className={styles.captionDot} aria-hidden="true" />
              یک گفت‌وگوی انسانی، با ریتم خودت
            </div>
          </div>
          <div className={styles.appPreview}>
            <div className={styles.appTopline}>
              <span className={styles.appBrand}>یکی هست</span>
              <span className={styles.appStatus}><span aria-hidden="true" /> آماده‌ی شنیدن</span>
            </div>
            <div className={styles.listenerIdentity}>
              <span className={styles.avatar}>ن</span>
              <span>
                <strong>نورا</strong>
                <small>شنونده‌ی تأییدشده</small>
              </span>
              <span className={styles.verified} aria-label="تأییدشده">✓</span>
            </div>
            <div className={styles.waveform} aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <p className={styles.appPrompt}>«می‌تونی از هرجایی که راحتی شروع کنی.»</p>
            <div className={styles.appFooter}>
              <span>ضبط خاموش</span>
              <span>کنترل با توست</span>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className={styles.processSection} aria-labelledby="process-title">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionKicker}>ساده شروع کن</p>
          <h2 id="process-title">لازم نیست برای شنیده‌شدن آماده باشی.</h2>
          <p>این تجربه برای همان لحظه‌هایی است که حرف‌زدن کمک می‌کند، اما نمی‌خواهی وارد توضیح‌های طولانی یا نصیحت‌های ناخواسته شوی.</p>
        </div>

        <ol className={styles.processList}>
          <li>
            <span className={styles.stepNumber}>۱</span>
            <div><h3>ورود با ایمیل</h3><p>حساب خودت را با یک کد ۶ رقمی برای ورود به همین ایمیل می‌فرستیم، تأیید می‌کنی.</p></div>
          </li>
          <li>
            <span className={styles.stepNumber}>۲</span>
            <div><h3>انتخاب شنونده</h3><p>پروفایل و سبک شنیدن را می‌بینی و وقتی مسیر عمومی باز باشد، خودت انتخاب می‌کنی.</p></div>
          </li>
          <li>
            <span className={styles.stepNumber}>۳</span>
            <div><h3>حرف‌زدن با ریتم خودت</h3><p>می‌توانی مکث کنی، موضوع را عوض کنی یا بگویی که فعلاً فقط می‌خواهی شنیده شوی.</p></div>
          </li>
        </ol>
      </section>

      <section className={styles.momentsSection} aria-labelledby="moments-title">
        <div className={styles.momentsHeader}>
          <p className={styles.sectionKicker}>برای وقت‌های واقعی</p>
          <h2 id="moments-title">هر حرفی لازم نیست یک راه‌حل داشته باشد.</h2>
        </div>
        <div className={styles.momentsGrid}>
          {moments.map((moment, index) => (
            <article className={styles.momentCard} key={moment.title}>
              <span className={styles.momentIndex}>۰{index + 1}</span>
              <h3>{moment.title}</h3>
              <p>{moment.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="trust" className={styles.trustSection} aria-labelledby="trust-title">
        <div className={styles.trustPanel}>
          <p className={styles.sectionKicker}>مرزها روشن‌اند</p>
          <h2 id="trust-title">شنونده قرار نیست زندگی‌ات را مدیریت کند.</h2>
          <p>نقش شنونده، توجه‌کردن و همراه‌ماندن با حرف توست. این سرویس مشاوره، درمان یا پاسخ اضطراری نیست.</p>
          <a className={styles.outlineAction} href="/trust">مرکز اعتماد و ایمنی <span aria-hidden="true">←</span></a>
        </div>
        <div className={styles.trustPoints}>
          <div><span className={styles.pointIcon}>◌</span><div><strong>ضبط خاموش</strong><p>در عرضه‌ی فعلی، محتوای صوتی مکالمه ضبط یا ذخیره نمی‌شود.</p></div></div>
          <div><span className={styles.pointIcon}>⌁</span><div><strong>اطلاعات شخصی در اختیار توست</strong><p>برای شنیده‌شدن لازم نیست هر اطلاعاتی را درباره‌ی خودت بگویی.</p></div></div>
          <div><span className={styles.pointIcon}>↗</span><div><strong>هر وقت بخواهی تمام می‌کنی</strong><p>رابطه‌ی شنونده و کاربر باید در چارچوب سرویس باقی بماند.</p></div></div>
        </div>
      </section>

      <section className={styles.listenerBanner} aria-labelledby="listener-title">
        <div>
          <p className={styles.sectionKicker}>اگر خوب گوش می‌دهی</p>
          <h2 id="listener-title">شنونده‌ی یکی هست شو.</h2>
          <p>پیش از ارزیابی، با نقش شنونده، مرزهای رابطه و اصول ایمنی آشنا می‌شوی.</p>
        </div>
        <a className={styles.darkAction} href="/listener">مسیر شنونده‌شدن <span aria-hidden="true">←</span></a>
      </section>

      <section id="login" className={styles.loginSection} aria-labelledby="login-title">
        <div className={styles.loginCopy}>
          <p className={styles.sectionKicker}>ورود امن</p>
          <h2 id="login-title">از همین‌جا شروع کن.</h2>
          <p>برای ورود فقط ایمیل لازم است. کد را به همان ایمیل می‌فرستیم و نشست ورود را روی همین مرورگر نگه می‌داریم.</p>
          <div className={styles.loginLinks}>
            <a href="/privacy">حریم خصوصی</a>
            <a href="/faq">سؤالات متداول</a>
          </div>
        </div>

        <div className={styles.loginPanel}>
          {step === 'email' && (
            <form className={styles.loginForm} onSubmit={requestCode}>
              <span className={styles.formLabel}>ورود با ایمیل</span>
              <h3>کد ورود را کجا بفرستیم؟</h3>
              <p className={styles.formHelp}>ایمیلی که همیشه به آن دسترسی داری وارد کن.</p>
              <label className={styles.fieldLabel} htmlFor="email">ایمیل</label>
              <input id="email" className={styles.field} type="email" dir="ltr" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.submitButton} type="submit" disabled={busy}>{busy ? 'در حال ارسال…' : 'فرستادن کد ورود'}</button>
              <p className={styles.privacyNote}>با ادامه، <a href="/privacy">حریم خصوصی</a> و <a href="/terms">قوانین استفاده</a> را می‌پذیری.</p>
            </form>
          )}

          {step === 'code' && (
            <form className={styles.loginForm} onSubmit={verifyCode}>
              <span className={styles.formLabel}>ایمیل ارسال شد</span>
              <h3>کد ۶ رقمی را وارد کن.</h3>
              <p className={styles.formHelp}>کد را به <strong dir="ltr">{verifiedEmail}</strong> فرستادیم.</p>
              <label className={styles.fieldLabel} htmlFor="code">کد ورود</label>
              <input id="code" className={styles.field + ' ' + styles.codeField} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="۰۰۰۰۰۰" />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.submitButton} type="submit" disabled={busy}>{busy ? 'در حال بررسی…' : 'تأیید و ورود'}</button>
              <button className={styles.textButton} type="button" onClick={editEmail}>ویرایش ایمیل</button>
            </form>
          )}

          {step === 'verified' && (
            <div className={styles.verifiedState}>
              <span className={styles.formLabel}>ورود انجام شد</span>
              <h3>خوش آمدی.</h3>
              <div className={styles.verifiedNotice}><p>حساب <strong dir="ltr">{verifiedEmail}</strong> با موفقیت تأیید شد.</p><p>گفت‌وگوی عمومی هنوز برای استفاده همگانی باز نشده است.</p></div>
              <div className={styles.verifiedActions}>
                <a className={styles.listenerAction} href="/listener">مسیر شنونده‌شدن</a>
                <button className={styles.textButton} type="button" onClick={logout}>خروج از حساب</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}><span className={styles.brandMark} aria-hidden="true">ی</span><strong>یکی هست</strong><p>برای وقت‌هایی که فقط می‌خواهی کسی گوش بدهد.</p></div>
        <nav className={styles.footerNav} aria-label="پیوندهای پایانی">
          <a href="/trust">اعتماد</a><a href="/safety">ایمنی</a><a href="/faq">سؤالات متداول</a><a href="/privacy">حریم خصوصی</a><a href="/terms">قوانین استفاده</a><a href="/account/delete">حذف حساب</a>
        </nav>
      </footer>
    </main>
  );
}
