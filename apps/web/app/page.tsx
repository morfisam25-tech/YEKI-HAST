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
          <h1 id="page-title" className={styles.heroTitle}>یک آدم واقعی گوش می‌دهد. لازم نیست دنبال راه‌حل باشی.</h1>
          <p className={styles.heroLead}>
            می‌توانی از هرجا خواستی شروع کنی، مکث کنی، بگویی راه‌حل نمی‌خواهی و فقط حرفت را بگویی. شنونده قرار است همراه گفت‌وگو بماند، نه اینکه زندگی‌ات را مدیریت کند.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#experience">ببین این گفت‌وگو چه شکلی است</a>
            <a className={styles.secondaryAction} href="#login">ورود با ایمیل</a>
          </div>
          <p className={styles.availability}>
            <strong>وضعیت فعلی: </strong>گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده. ورود با ایمیل و مسیر ثبت‌نام، آموزش و ارزیابی شنونده فعال است.
          </p>
        </div>

        <aside className={styles.heroAside} aria-label="برای حرف‌زدن چه چیزی لازم نیست">
          <p className={styles.heroAsideTitle}>برای شروع حرف‌زدن لازم نیست:</p>
          <ul className={styles.heroAsideList}>
            <li>از قبل بدانی دقیقاً چه می‌خواهی بگویی.</li>
            <li>از شنونده راه‌حل یا توصیه بخواهی.</li>
            <li>همه‌چیز را یک‌دفعه و کامل توضیح بدهی.</li>
          </ul>
        </aside>
      </section>

      <section id="experience" className={styles.section} aria-labelledby="experience-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionNumber}>01</p>
          <p className={styles.sectionKicker}>وقتی حرف می‌زنی</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="experience-title" className={styles.sectionTitle}>لازم نیست گفت‌وگو را «درست» انجام بدهی.</h2>
          <p className={styles.sectionIntro}>
            بعضی حرف‌ها مرتب نیستند. ممکن است وسط یک موضوع وارد موضوع دیگری شوی، یا چند لحظه چیزی برای گفتن نداشته باشی. این‌ها مانع گفت‌وگو نیستند.
          </p>
          <ul className={styles.freedomList}>
            <li className={styles.freedomItem}>
              <strong>از وسطش شروع کن.</strong>
              <span>لازم نیست اول داستان را برای طرف مقابل خلاصه کنی یا همه زمینه را توضیح بدهی.</span>
            </li>
            <li className={styles.freedomItem}>
              <strong>بگو راه‌حل نمی‌خواهی.</strong>
              <span>می‌توانی روشن بگویی که فعلاً فقط می‌خواهی حرفت شنیده شود.</span>
            </li>
            <li className={styles.freedomItem}>
              <strong>مکث کن.</strong>
              <span>سکوت بخشی از گفت‌وگوست؛ قرار نیست هر چند ثانیه چیزی برای گفتن پیدا کنی.</span>
            </li>
            <li className={styles.freedomItem}>
              <strong>مسیر حرف را عوض کن.</strong>
              <span>اگر دیگر نمی‌خواهی درباره موضوعی ادامه بدهی، لازم نیست آن را تا نتیجه پیش ببری.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="human-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionNumber}>02</p>
          <p className={styles.sectionKicker}>چرا یک انسان؟</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="human-title" className={styles.sectionTitle}>گاهی مهم است طرف مقابل واقعاً یک نفر باشد.</h2>
          <p className={styles.sectionIntro}>
            هوش مصنوعی می‌تواند برای فکرکردن، نوشتن یا تحلیل مفید باشد. دوست و متخصص هم جای خودشان را دارند. اما گاهی خواسته ساده‌تر است: چیزی را به یک آدم بگویی و بدانی یک انسان در همان گفت‌وگو حاضر است، می‌شنود و به‌عنوان یک آدم واکنش نشان می‌دهد.
          </p>
          <div className={styles.humanStatement}>
            <p>«یکی هست» فضایی برای گفت‌وگوی محترمانه با یک شنونده انسانی است؛ تمرکز این رابطه روی شنیدن است، نه تبدیل هر حرف به تحلیل، برنامه یا توصیه.</p>
            <p>این انتخاب قرار نیست جای دوست، ابزارهای دیجیتال یا کمک حرفه‌ای را بگیرد. فقط پاسخ به یک نیاز متفاوت است: شنیده‌شدن توسط یک نفر دیگر.</p>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="listener-does-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionNumber}>03</p>
          <p className={styles.sectionKicker}>نقش شنونده</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="listener-does-title" className={styles.sectionTitle}>شنونده قرار نیست هر حرف را به توصیه تبدیل کند.</h2>
          <p className={styles.sectionIntro}>
            نقش او این است که گفت‌وگو را با توجه دنبال کند و به تو جا بدهد حرفت را با ریتم خودت پیش ببری.
          </p>
          <dl className={styles.listenerDefinition}>
            <div className={styles.definitionRow}>
              <dt>دنبال‌کردن</dt>
              <dd>به چیزی که می‌گویی توجه می‌کند و رشته حرف را بی‌دلیل عوض نمی‌کند.</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>پرسیدن</dt>
              <dd>وقتی کمک‌کننده باشد، سؤال باز و محترمانه می‌پرسد؛ نه برای بازجویی یا هدایت تو به یک پاسخ خاص.</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>بازتاب</dt>
              <dd>ممکن است آنچه فهمیده را با کلمات خودش برگرداند تا روشن شود درست شنیده است.</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>جا برای سکوت</dt>
              <dd>لازم نیست هر مکثی را با حرف یا توصیه پر کند.</dd>
            </div>
          </dl>
          <div className={styles.boundaryNote}>
            <strong>مرز نقش روشن است. </strong>این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست. هدف نقش شنونده نیز آشنایی عاطفی، رابطه شخصی یا انتقال ارتباط به بیرون از سرویس نیست.
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="journey-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionNumber}>04</p>
          <p className={styles.sectionKicker}>مسیر گفت‌وگو</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="journey-title" className={styles.sectionTitle}>مسیر قرار است ساده بماند: ورود، انتخاب، گفت‌وگو.</h2>
          <p className={styles.sectionIntro}>
            وقتی مسیر عمومی در دسترس باشد، تجربه برای این ترتیب طراحی شده است. وضعیت دسترسی فعلی همان است که بالای صفحه آمده و این توضیح وعده بازبودن سرویس نیست.
          </p>
          <ol className={styles.journey}>
            <li className={styles.journeyItem}>
              <div>
                <h3>با ایمیل وارد می‌شوی.</h3>
                <p>مالکیت ایمیل با کد ورود تأیید می‌شود؛ برای دیدن توضیحات عمومی صفحه نیازی به ورود نیست.</p>
              </div>
            </li>
            <li className={styles.journeyItem}>
              <div>
                <h3>شنونده را در مسیر گفت‌وگوی عمومی انتخاب می‌کنی.</h3>
                <p>اطلاعاتی که درباره شنونده می‌بینی باید با تفاوت میان معرفی خود فرد و اطلاعاتی که واقعاً بررسی شده خوانده شود.</p>
              </div>
            </li>
            <li className={styles.journeyItem}>
              <div>
                <h3>موضوع و ریتم گفت‌وگو را تو تعیین می‌کنی.</h3>
                <p>می‌توانی بگویی چه می‌خواهی و چه نمی‌خواهی؛ شنونده باید در مرز نقش خودش بماند.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="trust-title">
        <div className={styles.sectionLabel}>
          <p className={styles.sectionNumber}>05</p>
          <p className={styles.sectionKicker}>اعتماد و کنترل</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="trust-title" className={styles.sectionTitle}>مرزها باید قبل از اعتماد معلوم باشند.</h2>
          <p className={styles.sectionIntro}>
            اعتماد در این سرویس از ادعاهای بزرگ نمی‌آید. بهتر است بدانی چه چیزی در اختیار توست و چه رفتاری با هدف سرویس سازگار نیست.
          </p>
          <div className={styles.trustGrid}>
            <article className={styles.trustItem}>
              <h3>تو انتخاب می‌کنی چه چیزی را بگویی.</h3>
              <p>لازم نیست اطلاعات شخصی‌ای را که برای حرفت ضروری نمی‌دانی وارد گفت‌وگو کنی.</p>
            </article>
            <article className={styles.trustItem}>
              <h3>رابطه قرار است داخل هدف سرویس بماند.</h3>
              <p>تبادل راه ارتباط شخصی یا بردن رابطه به بیرون از سرویس، هدف «یکی هست» نیست.</p>
            </article>
            <article className={styles.trustItem}>
              <h3>رفتار نامناسب پذیرفته نیست.</h3>
              <p>آزار، تهدید، توهین یا درخواست نامناسب با نقش شنونده و هدف گفت‌وگو سازگار نیست.</p>
            </article>
            <article className={styles.trustItem}>
              <h3>همه اطلاعات پروفایل یک نوع نیستند.</h3>
              <p>معرفی‌ای که خود فرد می‌نویسد و اطلاعاتی که واقعاً بررسی شده‌اند، یک چیز محسوب نمی‌شوند.</p>
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
          <p className={styles.sectionNumber}>06</p>
          <p className={styles.sectionKicker}>آمادگی شنونده</p>
        </div>
        <div className={styles.sectionBody}>
          <h2 id="quality-title" className={styles.sectionTitle}>قبل از ارزیابی، نقش و مرزهای شنونده آموزش داده می‌شود.</h2>
          <p className={styles.sectionIntro}>
            عنوان «شنونده» به‌تنهایی نشانه آمادگی نیست. مسیر فعلی برای متقاضی، یادگیری نقش را پیش از ارزیابی قرار می‌دهد.
          </p>
          <ul className={styles.qualitySteps}>
            <li className={styles.qualityStep}>
              <strong>نقش و گوش‌دادن فعال</strong>
              <span>متقاضی با هدف نقش، توجه به حرف طرف مقابل و شکل سؤال‌پرسیدن آشنا می‌شود.</span>
            </li>
            <li className={styles.qualityStep}>
              <strong>مرزهای رفتاری</strong>
              <span>آموزش شامل مرز رابطه و برخورد با موقعیت‌هایی است که حساسیت بیشتری می‌خواهند.</span>
            </li>
            <li className={styles.qualityStep}>
              <strong>ارزیابی</strong>
              <span>بعد از آموزش، ارزیابی بخشی از مسیر شنونده‌شدن است؛ صرف ساختن حساب یا نوشتن پروفایل کافی نیست.</span>
            </li>
            <li className={styles.qualityStep}>
              <strong>اطلاعات بررسی‌شده</strong>
              <span>هرجا بررسی هویت در فرایند مربوط اعمال شود، نتیجه آن جدا از اطلاعاتی است که فرد صرفاً درباره خودش نوشته است.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.listenerCta} aria-labelledby="become-listener-title">
        <div>
          <p className={styles.eyebrow}>برای کسانی که می‌خواهند شنونده شوند</p>
          <h2 id="become-listener-title">خوب شنیدن، مسئولیت و مهارت می‌خواهد.</h2>
          <p>مسیر شنونده‌شدن فعال است و شامل آشنایی با نقش، آموزش و ارزیابی می‌شود. این مسیر، بخش فرعی این صفحه است؛ نه پیش‌فرض هر کسی که وارد حساب می‌شود.</p>
        </div>
        <a className={styles.listenerLink} href="/listener">درباره شنونده‌شدن</a>
      </section>

      <section id="login" className={styles.loginSection} aria-labelledby="login-title">
        <div className={styles.loginCopy}>
          <p className={styles.eyebrow}>ورود با ایمیل</p>
          <h2 id="login-title">بدون رمز عبور وارد شو.</h2>
          <p>ایمیلت را وارد کن. کد ورود به همان آدرس فرستاده می‌شود. ورود به حساب به معنی بازبودن گفت‌وگوی عمومی نیست و تو را مجبور به ورود به مسیر شنونده نمی‌کند.</p>
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
                <p>گفت‌وگوی عمومی فعلاً باز نیست. برای ماندن در حساب لازم نیست وارد مسیر شنونده شوید.</p>
                <p>اگر خودتان برای شنونده‌شدن آمده‌اید، مسیر ثبت‌نام، آموزش و ارزیابی فعال است.</p>
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
        <p>«یکی هست» برای گفت‌وگوی انسانی با مرز روشن طراحی شده است. برای شرایط اضطراری یا نیاز پزشکی، حقوقی یا درمانی باید از خدمات تخصصی مربوط استفاده شود.</p>
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
