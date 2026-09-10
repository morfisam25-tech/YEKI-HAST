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
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="یکی هست، صفحه اصلی">
          <span className={styles.brandMark} aria-hidden="true">◒</span>
          <span>
            <strong>یکی هست</strong>
            <small>یک انسان، برای شنیدن</small>
          </span>
        </a>
        <nav className={styles.nav} aria-label="ناوبری اصلی">
          <a href="#how">چطور کار می‌کند</a>
          <a href="#trust">اعتماد و مرزها</a>
          <a href="/listener">شنونده‌شدن</a>
          <a className={styles.navLogin} href="#login">ورود</a>
        </nav>
      </header>

      <section id="top" className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroImage} role="img" aria-label="دو نفر در دو خانه، در یک گفت‌وگوی انسانی">
          <div className={styles.heroShade} />
        </div>
        <div className={styles.heroContent}>
          <p className={styles.eyebrowLight}>گفت‌وگو با یک شنوندهٔ انسانی</p>
          <h1 id="hero-title">گاهی فقط لازمه تو حرفات‌و بزنی؛ یکی باشه که فقط گوش کنه</h1>
          <p className={styles.heroLead}>لازم نیست حرفات‌و مرتب کنی یا از اول تعریفش کنی. این‌جا یکی هست که بهت گوش می‌ده، حتی وقتی همهٔ حرفت سکوتِ.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#login">با ایمیل وارد شو</a>
            <a className={styles.ghostButton} href="#how">تجربه را ببین <span aria-hidden="true">←</span></a>
          </div>
          <div className={styles.betaNote}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span><strong>گفت‌وگوی عمومی فعلاً بسته است.</strong> ورود و مسیر شنونده‌شدن در دسترس است.</span>
          </div>
        </div>
        <div className={styles.heroCaption}>دو اتاق. دو زندگی. یک حضور.</div>
      </section>

      <section className={styles.introSection} aria-labelledby="intro-title">
        <div className={styles.sectionEyebrow}>برای وقت‌هایی که</div>
        <div>
          <h2 id="intro-title">آدم‌ها همیشه دنبال راه‌حل نیستند.</h2>
          <p className={styles.introText}>گاهی می‌خواهی چیزی را با صدای بلند بگویی و بدانی آن طرف خط، یک آدم واقعی با توجه گوش می‌دهد. همین.</p>
        </div>
      </section>

      <section className={styles.dualSection} aria-labelledby="distance-title">
        <div className={`${styles.photoPanel} ${styles.diasporaPhoto}`} role="img" aria-label="یک زن و یک مرد در دو خانه در شیکاگو، در دو سوی یک تماس" />
        <div className={styles.dualCopy}>
          <p className={styles.sectionEyebrow}>فاصله همیشه روی نقشه نیست</p>
          <h2 id="distance-title">از تهران تا شیکاگو، همهٔ شب‌ها شبیه هم‌اند؛ ولی غربت این را نمی‌فهمد.</h2>
          <p className={styles.diasporaPoem}>
            <span>یکی هست بخواد بهت گوش بده اینجا</span>
            <span>یکی هست بدون هیچ قضاوتی بشنوه تنها</span>
            <span>یکی هست نبینتت، نشناستت، دیگه تو رو، بعد همه غم ها و دردات</span>
            <span>یکی هست همدرد لحظه های سخت تنهاییت باشه</span>
            <span>یکی هست فقط براش گریه کنی، گوش بده اون فقط به اشکات</span>
            <span>یکی هست بهش بگی بفهمه غربت، چطوری غرورت و شکست، تو شبها</span>
            <span>یکی هست حتی واسه، شنیدن سکوت سنگینت تو غمها</span>
            <span>مهم نیست چند سالته و کجایی. فقط کافیه بدونی یکی هست اینجا واسه تو سبک شه دردات</span>
          </p>
          <a className={styles.textLink} href="#login">برای آشنایی، وارد شو <span aria-hidden="true">←</span></a>
        </div>
      </section>

      <section id="how" className={styles.howSection} aria-labelledby="how-title">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>ساده شروع می‌شود</p>
          <h2 id="how-title">سه قدم تا یک گفت‌وگوی واقعی</h2>
        </div>
        <div className={styles.stepsGrid}>
          <article className={styles.stepCard}>
            <span className={styles.stepNumber}>۰۱</span>
            <h3>با ایمیل وارد می‌شوی</h3>
            <p>رمز عبور لازم نیست. یک کد کوتاه به ایمیلت می‌آید.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepNumber}>۰۲</span>
            <h3>زبان و زمانت را انتخاب می‌کنی</h3>
            <p>وقتی گفت‌وگوی عمومی باز شود، انتخاب شنونده و زمان در اختیار توست.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepNumber}>۰۳</span>
            <h3>حرف را با ریتم خودت پیش می‌بری</h3>
            <p>می‌توانی مکث کنی، موضوع را عوض کنی یا هر وقت خواستی تماس را تمام کنی.</p>
          </article>
        </div>
      </section>

      <section className={styles.momentsSection} aria-labelledby="moments-title">
        <div className={styles.momentsLead}>
          <p className={styles.sectionEyebrow}>آدم‌ها به دلیل‌های مختلفی حرف می‌زنند</p>
          <h2 id="moments-title">بعضی وقت‌ها، حرف‌زدن خودش کافی است.</h2>
          <p>«یکی هست» قرار نیست زندگی را توضیح بدهد. فقط جایی می‌سازد که بتوانی چند دقیقه، خودت باشی.</p>
        </div>
        <div className={styles.momentsImage} role="img" aria-label="دو نسل در دو خانه، در یک ارتباط گرم" />
        <div className={styles.momentList}>
          <div><strong>وقتی دور از خانه‌ای</strong><span>هیچ‌کس امروزت را ندیده است.</span></div>
          <div><strong>وقتی با خانواده حرف نمی‌شود</strong><span>گاهی شنیده‌شدن، قبل از توضیح‌دادن می‌آید.</span></div>
          <div><strong>وقتی خوابت نمی‌برد</strong><span>می‌توانی از یک گفت‌وگوی ساده شروع کنی.</span></div>
        </div>
      </section>

      <section className={styles.productSection} aria-labelledby="product-title">
        <div className={styles.productCopy}>
          <p className={styles.sectionEyebrow}>محصولی که پشت این حس است</p>
          <h2 id="product-title">برای شنیدن، مسیر را ساده نگه داشته‌ایم.</h2>
          <p>مسیر «یکی هست» کوتاه نگه داشته شده: ورود روشن، مرزهای مشخص، و یک گفت‌وگوی صوتی که هر دو طرف می‌دانند برای چه آمده‌اند.</p>
          <div className={styles.featureList}>
            <div><span>◌</span><p><strong>ورود با ایمیل</strong><small>بدون ساختن رمز عبور</small></p></div>
            <div><span>◌</span><p><strong>گفت‌وگوی صوتی</strong><small>در چارچوبی که از قبل روشن است</small></p></div>
            <div><span>◌</span><p><strong>خروج و گزارش</strong><small>کنترل تماس همیشه با توست</small></p></div>
          </div>
        </div>
        <div className={styles.productVisual}>
          <div className={styles.phoneShell}>
            <div className={styles.phoneTop}><span>۹:۴۱</span><span>● ● ●</span></div>
            <div className={styles.phoneBrand}><span className={styles.phoneMark}>◒</span><strong>یکی هست</strong></div>
            <div className={styles.phoneGreeting}>امشب، حرفی هست؟</div>
            <div className={styles.phonePanel}><small>مسیر تو</small><strong>یک گفت‌وگوی آرام</strong><span>با یک شنوندهٔ انسانی</span><button type="button" disabled>فعلاً بسته است</button></div>
            <div className={styles.phoneFooter}><span>خانه</span><span>گفت‌وگو</span><span>حساب</span></div>
          </div>
          <div className={styles.productPhoto} role="img" aria-label="دستی که روی آیکن یکی هست در تلفن می‌زند" />
        </div>
      </section>

      <section id="trust" className={styles.trustSection} aria-labelledby="trust-title">
        <div className={styles.trustHeading}>
          <p className={styles.sectionEyebrow}>اعتماد، قبل از صمیمیت</p>
          <h2 id="trust-title">مرزها را از اول روشن می‌کنیم.</h2>
        </div>
        <div className={styles.trustGrid}>
          <article><span>۰۱</span><h3>این درمان نیست.</h3><p>شنونده جای پزشک، روان‌شناس، دوست یا خدمات اضطراری نیست.</p></article>
          <article><span>۰۲</span><h3>اطلاعاتت انتخاب خودت است.</h3><p>لازم نیست چیزی را بگویی که برای گفت‌وگویت ضروری نمی‌دانی.</p></article>
          <article><span>۰۳</span><h3>هر وقت بخواهی، تمام می‌کنی.</h3><p>پایان تماس و گزارش‌کردن تجربه، بخشی از کنترل توست.</p></article>
        </div>
        <a className={styles.outlineButton} href="/trust">مرکز اعتماد را بخوان</a>
      </section>

      <section className={styles.listenerSection} aria-labelledby="listener-title">
        <div>
          <p className={styles.sectionEyebrow}>برای آدم‌هایی که خوب گوش می‌دهند</p>
          <h2 id="listener-title">شنونده‌شدن، از خوب گوش‌دادن شروع می‌شود.</h2>
          <p>اگر می‌دانی چطور به حرف یک آدم جا بدهی، مسیر شنونده‌شدن را ببین. آموزش و ارزیابی، قبل از شروع نقش قرار دارند.</p>
        </div>
        <a className={styles.darkButton} href="/listener">مسیر شنونده‌شدن <span aria-hidden="true">←</span></a>
      </section>

      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div>
          <p className={styles.sectionEyebrow}>سؤال‌های کوتاه</p>
          <h2 id="faq-title">قبل از شروع، جواب چند سؤال روشن است.</h2>
        </div>
        <div className={styles.faqList}>
          <details><summary>«یکی هست» برای چیست؟</summary><p>برای گفت‌وگوی محترمانه با یک شنوندهٔ انسانی؛ وقتی می‌خواهی حرفت شنیده شود.</p></details>
          <details><summary>الان می‌توانم با شنونده تماس بگیرم؟</summary><p>نه. گفت‌وگوی عمومی و رزرو تماس فعلاً بسته است. این صفحه وضعیت فعلی را پنهان نمی‌کند.</p></details>
          <details><summary>شنونده چه نقشی دارد؟</summary><p>گوش‌دادن با توجه، پرسیدن محترمانه و رعایت مرزها؛ نه درمان، تشخیص یا مدیریت زندگی تو.</p></details>
        </div>
        <a className={styles.textLink} href="/faq">همه پرسش‌ها و پاسخ‌ها <span aria-hidden="true">←</span></a>
      </section>

      <section id="login" className={styles.loginSection} aria-labelledby="login-title">
        <div className={styles.loginCopy}>
          <p className={styles.eyebrowLight}>آمادهٔ آشنایی هستی؟</p>
          <h2 id="login-title">از یک ایمیل شروع کن.</h2>
          <p>ورود فعلاً برای حساب و ادامهٔ مسیر شنونده‌شدن استفاده می‌شود. برای خواندن دربارهٔ «یکی هست»، لازم نیست وارد شوی.</p>
        </div>
        <div className={styles.loginPanel} aria-live="polite">
          {step === 'email' && (
            <form onSubmit={requestCode} className={styles.loginForm}>
              <div><span className={styles.formStep}>ورود با ایمیل</span><h3>کد را به کجا بفرستیم؟</h3></div>
              <label htmlFor="email">ایمیل</label>
              <input id="email" name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال کد ورود'}</button>
              <p className={styles.formNote}>کد ورود فقط برای همین ایمیل ارسال می‌شود.</p>
            </form>
          )}
          {step === 'code' && (
            <form onSubmit={verifyCode} className={styles.loginForm}>
              <div><span className={styles.formStep}>یک قدم مانده</span><h3>کد شش‌رقمی را وارد کن.</h3><p className={styles.formNote}>کد به <b dir="ltr">{verifiedEmail}</b> فرستاده شد.</p></div>
              <label htmlFor="code">کد ورود</label>
              <input id="code" name="code" className={styles.codeInput} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="۰۰۰۰۰۰" required />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? 'در حال بررسی…' : 'تأیید و ورود'}</button>
              <button className={styles.plainButton} type="button" onClick={editEmail}>ویرایش ایمیل</button>
            </form>
          )}
          {step === 'verified' && (
            <div className={styles.loginForm}>
              <span className={styles.successMark}>✓</span>
              <h3>ایمیل تأیید شد.</h3>
              <p className={styles.formNote}>حساب تو آماده است. برای ادامهٔ مسیر، از بخش شنونده‌شدن وارد شو.</p>
              <a className={styles.primaryButton} href="/listener">ادامه به شنونده‌شدن</a>
              <button className={styles.plainButton} type="button" onClick={() => void logout()}>خروج از حساب</button>
            </div>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top"><span className={styles.brandMark} aria-hidden="true">◒</span><span><strong>یکی هست</strong><small>یک انسان، برای شنیدن</small></span></a>
        <div className={styles.footerLinks}><a href="/trust">اعتماد</a><a href="/safety">ایمنی</a><a href="/privacy">حریم خصوصی</a><a href="/terms">قوانین</a><a href="/faq">پرسش‌های رایج</a></div>
        <p>برای حرف‌هایی که لازم نیست تنهایی حملشان کنی.</p>
      </footer>
    </main>
  );
}
