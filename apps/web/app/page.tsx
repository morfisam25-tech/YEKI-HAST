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
    <main className={styles.home}>
      <header className={styles.header}>
        <div className={styles.brandLockup}>
          <strong className={styles.brand}>یکی هست</strong>
          <span className={styles.brandPromise}>یک انسان، برای شنیدن</span>
        </div>
        <nav className={styles.headerNav} aria-label="دسترسی سریع">
          <a href="#login">ورود</a>
          <a href="/listener">شنونده‌شدن</a>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroMain}>
          <p className={styles.eyebrow}>گفت‌وگو با یک شنونده انسانی</p>
          <h1 id="page-title" className={styles.heroTitle}>یک آدم واقعی گوش می‌دهد. لازم نیست دنبال راه‌حل باشید.</h1>
          <p className={styles.heroLead}>
            می‌توانید از هرجای حرف شروع کنید، مکث کنید یا روشن بگویید که راه‌حل نمی‌خواهید. شنونده قرار است با توجه همراه حرف شما بماند، نه اینکه زندگی‌تان را مدیریت کند.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#experience">ببینید این تجربه چه شکلی است</a>
            <a className={styles.secondaryAction} href="#trust">مرزها و کنترل</a>
          </div>
          <p className={styles.availability}>
            <strong>وضعیت فعلی: </strong>گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده. مسیر شنونده‌شدن فعال است و ورود با ایمیل برای حساب و همین مسیر در دسترس است.
          </p>
        </div>

        <aside className={styles.heroAside} aria-label="برای حرف‌زدن چه چیزی لازم نیست">
          <p className={styles.heroAsideTitle}>برای شروع حرف‌زدن لازم نیست:</p>
          <ul className={styles.heroAsideList}>
            <li>از قبل بدانید دقیقاً چه می‌خواهید بگویید.</li>
            <li>از شنونده راه‌حل یا توصیه بخواهید.</li>
            <li>همه‌چیز را یک‌باره و کامل توضیح دهید.</li>
          </ul>
        </aside>
      </section>

      <section id="experience" className={styles.section} aria-labelledby="experience-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionKicker}>وقتی حرف می‌زنید</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="experience-title" className={styles.sectionTitle}>لازم نیست حرف‌ها مرتب و آماده باشند.</h2>
          <p className={styles.sectionIntro}>
            ممکن است وسط یک موضوع سراغ موضوع دیگری بروید یا چند لحظه چیزی برای گفتن نداشته باشید. این‌ها مانع شنیده‌شدن نیستند.
          </p>
          <ul className={styles.freedomList}>
            <li className={styles.freedomItem}>
              <strong>از هرجای حرف شروع کنید.</strong>
              <span>لازم نیست اول داستان را خلاصه کنید یا همه زمینه را توضیح دهید.</span>
            </li>
            <li className={styles.freedomItem}>
              <strong>اگر راه‌حل نمی‌خواهید، بگویید.</strong>
              <span>می‌توانید روشن کنید که فعلاً فقط می‌خواهید حرفتان شنیده شود.</span>
            </li>
            <li className={styles.freedomItem}>
              <strong>برای مکث جا هست.</strong>
              <span>سکوت بخشی از صحبت است؛ لازم نیست هر چند ثانیه چیزی برای گفتن پیدا کنید.</span>
            </li>
            <li className={styles.freedomItem}>
              <strong>مسیر حرف را عوض کنید.</strong>
              <span>اگر نمی‌خواهید موضوعی را ادامه دهید، لازم نیست آن را تا نتیجه پیش ببرید.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="human-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionKicker}>چرا یک انسان؟</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="human-title" className={styles.sectionTitle}>گاهی مهم است طرف مقابل واقعاً یک نفر باشد.</h2>
          <p className={styles.sectionIntro}>
            هوش مصنوعی می‌تواند برای فکرکردن، نوشتن یا تحلیل مفید باشد. دوست و متخصص هم جای خودشان را دارند. بعضی وقت‌ها نیاز چیز دیگری است: حرفتان را به یک آدم بگویید و بدانید یک انسان همان‌جا گوش می‌دهد.
          </p>
          <div className={styles.humanStatement}>
            <p>«یکی هست» فضایی برای گفت‌وگوی محترمانه با یک شنونده انسانی است؛ تمرکز این رابطه روی شنیدن است، نه تبدیل هر حرف به تحلیل، برنامه یا توصیه.</p>
            <p>این انتخاب قرار نیست جای دوست، ابزارهای دیجیتال یا کمک حرفه‌ای را بگیرد. برای وقت‌هایی است که می‌خواهید یک نفر دیگر واقعاً حرفتان را بشنود.</p>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="listener-does-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionKicker}>نقش شنونده</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="listener-does-title" className={styles.sectionTitle}>شنونده قرار نیست هر حرف را به توصیه تبدیل کند.</h2>
          <p className={styles.sectionIntro}>
            شنونده با توجه حرف شما را دنبال می‌کند و به شما جا می‌دهد صحبت را با ریتم خودتان پیش ببرید.
          </p>
          <dl className={styles.listenerDefinition}>
            <div className={styles.definitionRow}>
              <dt>دنبال‌کردن</dt>
              <dd>به چیزی که می‌گویید توجه می‌کند و رشته حرف را بی‌دلیل عوض نمی‌کند.</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>پرسیدن</dt>
              <dd>اگر به ادامه حرف کمک کند، سؤال باز و محترمانه می‌پرسد؛ نه برای بازجویی یا رساندن شما به پاسخ خاصی.</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>بازتاب</dt>
              <dd>گاهی آنچه شنیده را با کلمات خودش برمی‌گرداند تا مطمئن شود درست فهمیده است.</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>جا برای سکوت</dt>
              <dd>لازم نیست هر مکثی با حرف یا توصیه پر شود.</dd>
            </div>
          </dl>
          <div className={styles.boundaryNote}>
            <strong>مرز نقش روشن است. </strong>این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست. نقش شنونده برای آشنایی عاطفی یا ادامه یک رابطه شخصی بیرون از سرویس هم تعریف نشده است.
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="journey-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionKicker}>مسیر صحبت</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="journey-title" className={styles.sectionTitle}>وقتی گفت‌وگوی عمومی فعال شود، مسیر ساده است.</h2>
          <p className={styles.sectionIntro}>ورود، انتخاب شنونده و شروع صحبت؛ بدون اینکه برای دیدن توضیحات عمومی مجبور به ساخت حساب باشید.</p>
          <ol className={styles.journey}>
            <li className={styles.journeyItem}>
              <div>
                <h3>با ایمیل وارد می‌شوید.</h3>
                <p>مالکیت ایمیل با کد ورود تأیید می‌شود. برای آشنایی با سرویس، ورود لازم نیست.</p>
              </div>
            </li>
            <li className={styles.journeyItem}>
              <div>
                <h3>شنونده را انتخاب می‌کنید.</h3>
                <p>بخشی از متن پروفایل را خود شنونده می‌نویسد. هر اطلاعاتی که جداگانه بررسی شده باشد باید روشن و متمایز نشان داده شود.</p>
              </div>
            </li>
            <li className={styles.journeyItem}>
              <div>
                <h3>حرف را با ریتم خودتان پیش می‌برید.</h3>
                <p>می‌توانید بگویید چه می‌خواهید و چه نمی‌خواهید؛ شنونده هم باید در چارچوب نقش خودش بماند.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section id="trust" className={styles.section} aria-labelledby="trust-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionKicker}>اعتماد و کنترل</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="trust-title" className={styles.sectionTitle}>حق انتخاب باید در خود تجربه دیده شود.</h2>
          <p className={styles.sectionIntro}>
            بهتر است پیش از شروع بدانید چه چیزی در اختیار شماست و رابطه شنونده با کاربر چه مرزی دارد.
          </p>
          <div className={styles.trustGrid}>
            <article className={styles.trustItem}>
              <h3>شما انتخاب می‌کنید چه چیزی را بگویید.</h3>
              <p>لازم نیست اطلاعات شخصی‌ای را که برای حرفتان ضروری نمی‌دانید وارد صحبت کنید.</p>
            </article>
            <article className={styles.trustItem}>
              <h3>رابطه در چارچوب «یکی هست» می‌ماند.</h3>
              <p>درخواست یا ردوبدل‌کردن شماره، آیدی یا راه تماس برای ادامه یک رابطه شخصی بیرون از سرویس، بخشی از رابطه شنونده و کاربر نیست.</p>
            </article>
            <article className={styles.trustItem}>
              <h3>رفتار نامناسب جایی در این رابطه ندارد.</h3>
              <p>آزار، تهدید، توهین یا درخواست نامناسب با نقش شنونده و هدف این فضا سازگار نیست.</p>
            </article>
            <article className={styles.trustItem}>
              <h3>همه اطلاعات پروفایل از یک جنس نیستند.</h3>
              <p>متن معرفی را خود شنونده می‌نویسد. اگر موردی جداگانه بررسی شده باشد، باید همان مورد به‌صورت مشخص از متن خود فرد جدا شود.</p>
            </article>
            <article className={styles.trustItem}>
              <h3>پایان تماس در اختیار شماست.</h3>
              <p>وقتی گفت‌وگوی عمومی فعال شود، می‌توانید تماس را به شکل عادی پایان دهید. برای موقعیت ناامن هم خروج امن جداگانه‌ای برای پایان تماس و مسدودکردن طرف مقابل در نظر گرفته شده است.</p>
            </article>
          </div>
          <div className={styles.inlineLinks}>
            <a href="/privacy">جزئیات حریم خصوصی</a>
            <a href="/terms">قوانین استفاده</a>
            <a href="/account/delete">حذف حساب</a>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="quality-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionKicker}>آمادگی شنونده</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="quality-title" className={styles.sectionTitle}>شنونده پیش از ارزیابی با نقش و مرزهای آن آشنا می‌شود.</h2>
          <p className={styles.sectionIntro}>
            ساخت حساب یا نوشتن پروفایل به‌تنهایی برای آماده‌شدن کافی نیست. مسیر فعلی شنونده‌شدن، آموزش را پیش از ارزیابی قرار می‌دهد.
          </p>
          <ul className={styles.qualitySteps}>
            <li className={styles.qualityStep}>
              <strong>شنیدن فعال</strong>
              <span>متقاضی با هدف نقش، توجه به حرف طرف مقابل و شکل سؤال‌پرسیدن آشنا می‌شود.</span>
            </li>
            <li className={styles.qualityStep}>
              <strong>مرزهای رابطه</strong>
              <span>آموزش شامل مرز ارتباط و برخورد با موقعیت‌هایی است که حساسیت بیشتری می‌خواهند.</span>
            </li>
            <li className={styles.qualityStep}>
              <strong>ارزیابی</strong>
              <span>بعد از آموزش، ارزیابی بخشی از مسیر شنونده‌شدن است؛ صرف ساخت حساب یا نوشتن پروفایل کافی نیست.</span>
            </li>
            <li className={styles.qualityStep}>
              <strong>معرفی و اطلاعات بررسی‌شده</strong>
              <span>متن معرفی را خود شنونده می‌نویسد. اگر اطلاعاتی جداگانه بررسی شده باشد، نتیجه باید با همان عنوان مشخص شود.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.listenerCta} aria-labelledby="become-listener-title">
        <div>
          <p className={styles.eyebrow}>برای کسانی که می‌خواهند شنونده شوند</p>
          <h2 id="become-listener-title">خوب شنیدن، مسئولیت و مهارت می‌خواهد.</h2>
          <p>مسیر شنونده‌شدن فعال است و شامل آشنایی با نقش، آموزش و ارزیابی می‌شود. اگر برای همین نقش آمده‌اید، می‌توانید جزئیات مسیر را جداگانه ببینید.</p>
        </div>
        <a className={styles.listenerLink} href="/listener">درباره شنونده‌شدن</a>
      </section>

      <section id="login" className={styles.loginSection} aria-labelledby="login-title">
        <div className={styles.loginCopy}>
          <p className={styles.eyebrow}>ورود با ایمیل</p>
          <h2 id="login-title">ورود با ایمیل، بدون رمز عبور.</h2>
          <p>ورود فعلاً برای حساب و ادامه مسیر شنونده‌شدن استفاده می‌شود. اگر فقط می‌خواهید با سرویس آشنا شوید، نیازی به ورود نیست.</p>
        </div>

        <div className={styles.loginPanel} aria-live="polite">
          {step === 'email' && (
            <form onSubmit={requestCode} className={styles.loginForm}>
              <div>
                <p className={styles.formEyebrow}>ورود به حساب</p>
                <h3>ایمیل شما</h3>
                <p className={styles.helper}>یک کد ۶ رقمی برای ورود به همین ایمیل می‌فرستیم.</p>
              </div>

              <label className={styles.fieldLabel} htmlFor="email">ایمیل</label>
              <input
                id="email"
                name="email"
                className={`${styles.field} ${styles.emailField}`}
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

              {error && <p className={styles.error} role="alert">{error}</p>}

              <button className={styles.submitButton} type="submit" disabled={busy}>
                {busy ? 'در حال ارسال…' : 'دریافت کد ورود'}
              </button>

              <p className={styles.privacyNote}>
                ایمیل برای ورود و امنیت حساب استفاده می‌شود. جزئیات استفاده و نگهداری داده‌ها در <a href="/privacy">حریم خصوصی</a> آمده است.
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className={styles.loginForm}>
              <div>
                <p className={styles.formEyebrow}>تأیید ایمیل</p>
                <h3>کد ورود</h3>
                <p className={styles.helper}>کد ۶ رقمی ارسال‌شده به <span dir="ltr">{verifiedEmail}</span> را وارد کنید.</p>
              </div>

              <label className={styles.fieldLabel} htmlFor="code">کد ۶ رقمی</label>
              <input
                id="code"
                name="code"
                className={`${styles.field} ${styles.codeField}`}
                aria-label="کد ورود"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="------"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={busy}
              />

              {error && <p className={styles.error} role="alert">{error}</p>}

              <button className={styles.submitButton} type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'در حال بررسی…' : 'تأیید و ورود'}
              </button>
              <button className={styles.textButton} type="button" onClick={editEmail} disabled={busy}>
                اصلاح ایمیل
              </button>
            </form>
          )}

          {step === 'verified' && (
            <div className={styles.verifiedState}>
              <p className={styles.formEyebrow}>ورود انجام شد</p>
              <h3>ایمیل شما تأیید شد.</h3>
              <div className={styles.verifiedNotice}>
                <p>اگر برای گفت‌وگو وارد شدید، گفت‌وگوی عمومی فعلاً باز نیست. ورود شما انجام شده و فعلاً کاری از طرف شما لازم نیست.</p>
                <p>اگر برای شنونده‌شدن آمده‌اید، مسیر ثبت‌نام، آموزش و ارزیابی فعال است.</p>
              </div>
              <div className={styles.verifiedActions}>
                <a className={styles.verifiedListenerLink} href="/listener">ادامه مسیر شنونده</a>
                <button className={styles.textButton} type="button" onClick={() => void logout()}>خروج از حساب</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>«یکی هست» برای گفت‌وگوی محترمانه با یک شنونده انسانی طراحی شده است؛ شما انتخاب می‌کنید چه بگویید و شنونده در چارچوب نقش خودش می‌ماند.</p>
        <nav className={styles.footerNav} aria-label="اطلاعات عمومی سرویس">
          <a href="/privacy">حریم خصوصی</a>
          <a href="/terms">قوانین استفاده</a>
          <a href="/account/delete">حذف حساب</a>
          <a href="mailto:sales@uniqueholding.com.tr">پشتیبانی</a>
        </nav>
      </footer>
    </main>
  );
}
