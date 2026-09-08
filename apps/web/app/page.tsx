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

const conversationMoments = [
  'حرفی را که مدام در ذهنتان می‌چرخد، با صدای بلند مرتب کنید.',
  'از همان ابتدا بگویید «راهکار نمی‌خواهم؛ فقط می‌خواهم حرف بزنم.»',
  'مکث کنید، موضوع را عوض کنید یا درباره چیزی که راحت نیستید توضیح ندهید.',
  'وقتی گفت‌وگو برایتان کافی است، همان‌جا تمامش کنید.',
];

const listenerPreparation = [
  ['نقش روشن', 'شنونده یاد می‌گیرد قرار نیست درمانگر، مشاور یا تصمیم‌گیرنده‌ی زندگی کاربر باشد.'],
  ['گوش‌دادن فعال', 'سؤال روشن، بازتاب درست حرف کاربر، سکوت به‌جا و پرهیز از تبدیل گفت‌وگو به بازجویی تمرین می‌شود.'],
  ['مرزها و موقعیت‌های حساس', 'مرزهای شخصی، رفتار نامناسب و واکنش مسئولانه در موضوعات حساس بخشی از آموزش است.'],
  ['ارزیابی', 'آموزش به‌تنهایی به معنی آماده‌بودن برای نقش نیست؛ مسیر ارزیابی جداگانه وجود دارد.'],
] as const;

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
        <a className={styles.brand} href="#top" aria-label="یکی هست، بازگشت به ابتدای صفحه">
          <span className={styles.brandMark} aria-hidden="true">یک</span>
          <span>
            <strong>یکی هست</strong>
            <small>یک انسان، برای شنیدن</small>
          </span>
        </a>
        <nav className={styles.headerNav} aria-label="بخش‌های اصلی">
          <a href="#experience">تجربه گفت‌وگو</a>
          <a href="#trust">اعتماد و مرزها</a>
          <a href="#access">ورود</a>
        </nav>
      </header>

      <section id="top" className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>گاهی لازم نیست چیزی را حل کنید</p>
          <h1 id="page-title">حرفی هست که می‌خواهید یک آدم واقعی بشنود؟</h1>
          <p className={styles.heroLead}>
            «یکی هست» فضایی برای گفت‌وگوی محترمانه با یک شنونده انسانی است؛ برای وقتی که می‌خواهید حرفتان را به یک آدم بگویید، بی‌آنکه گفت‌وگو مجبور باشد تبدیل به درمان، نصیحت یا تصمیم‌گیری به‌جای شما شود.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#experience">ببینید گفت‌وگو چه حال‌وهوایی دارد</a>
            <a className={styles.secondaryAction} href="#access">ورود به حساب</a>
          </div>
          <div className={styles.availability} role="note" aria-label="وضعیت فعلی سرویس">
            <span className={styles.availabilityDot} aria-hidden="true" />
            <p>
              <strong>فعلاً:</strong> مسیر آموزش و ارزیابی شنونده فعال است. گفت‌وگوی عمومی با شنونده و رزرو تماس هنوز برای استفاده همگانی باز نشده.
            </p>
          </div>
        </div>

        <aside className={styles.heroAside} aria-label="نمونه‌ای از حق انتخاب در گفت‌وگو">
          <div className={styles.listenMotif} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className={styles.asideLabel}>این گفت‌وگو قرار نیست از شما اجرا بخواهد.</p>
          <p className={styles.asideStatement}>«فقط می‌خواهم بگویم چه شد. فعلاً دنبال راه‌حل نیستم.»</p>
          <div className={styles.asideRule} />
          <p className={styles.asideResponse}>یک شنونده خوب می‌تواند همین خواسته را بفهمد و به آن احترام بگذارد.</p>
        </aside>
      </section>

      <section className={styles.editorialSection} aria-labelledby="human-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>چرا یک انسان؟</p>
          <h2 id="human-title">گاهی چیزی که کم است، پاسخ نیست؛ حضور یک نفر دیگر است.</h2>
        </div>
        <div className={styles.humanDifference}>
          <p>
            هوش مصنوعی می‌تواند برای فکرکردن، نوشتن یا مرتب‌کردن موضوع‌ها مفید باشد. دوست و خانواده هم جای خودشان را دارند. متخصص هم وقتی مسئله به تخصص نیاز دارد، نقش خودش را دارد.
          </p>
          <p className={styles.pullQuote}>
            «یکی هست» برای یک نیاز مشخص ساخته شده: اینکه حرفتان را یک انسان واقعی بشنود و گفت‌وگو لازم نباشد حتماً به توصیه، تشخیص یا راه‌حل ختم شود.
          </p>
        </div>
      </section>

      <section id="experience" className={styles.experienceSection} aria-labelledby="experience-title">
        <div className={styles.experienceIntro}>
          <p className={styles.eyebrow}>گفت‌وگو از سمت شما شکل می‌گیرد</p>
          <h2 id="experience-title">می‌توانید فقط حرف بزنید.</h2>
          <p>
            شنونده به شما فرصت حرف‌زدن می‌دهد، سؤال‌های روشن و محترمانه می‌پرسد و لازم نیست با همه انتخاب‌های شما موافق باشد تا محترمانه گوش کند.
          </p>
        </div>
        <div className={styles.momentList}>
          {conversationMoments.map((moment, index) => (
            <div className={styles.moment} key={moment}>
              <span aria-hidden="true">۰{index + 1}</span>
              <p>{moment}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.flowSection} aria-labelledby="flow-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>وقتی مسیر عمومی باز شود</p>
          <h2 id="flow-title">اصل تجربه ساده می‌ماند: انتخاب کنید، حرف بزنید، هر وقت خواستید تمام کنید.</h2>
          <p className={styles.sectionLead}>
            این توضیح درباره شکل موردنظر محصول است، نه اعلام فعال‌بودن سرویس عمومی در حال حاضر.
          </p>
        </div>
        <ol className={styles.flowList}>
          <li>
            <span>۱</span>
            <div>
              <h3>شنونده را انتخاب می‌کنید</h3>
              <p>پروفایل و اطلاعات قابل‌نمایش باید کمک کند بدانید قرار است با چه کسی صحبت کنید؛ بدون اینکه ادعای بررسی‌نشده به‌عنوان تأیید پلتفرم نمایش داده شود.</p>
            </div>
          </li>
          <li>
            <span>۲</span>
            <div>
              <h3>گفت‌وگو با نقش روشن شروع می‌شود</h3>
              <p>شنونده برای شنیدن است. گفت‌وگو قرار نیست درمان، تشخیص یا تصمیم‌گیری حرفه‌ای به‌جای شما باشد.</p>
            </div>
          </li>
          <li>
            <span>۳</span>
            <div>
              <h3>کنترل موضوع و ادامه‌دادن با شماست</h3>
              <p>شما انتخاب می‌کنید چه چیزی را بگویید، کجا مکث کنید و چه زمانی گفت‌وگو برایتان کافی است.</p>
            </div>
          </li>
        </ol>
        <div className={styles.closedNotice} role="note">
          <strong>وضعیت امروز</strong>
          <p>گفت‌وگوی عمومی و رزرو هنوز باز نیست و در این صفحه دکمه‌ای برای شروع قابلیتی که فعال نشده وجود ندارد.</p>
        </div>
      </section>

      <section className={styles.listenersSection} aria-labelledby="listeners-title">
        <div className={styles.listenersIntro}>
          <p className={styles.eyebrow}>آن طرف گفت‌وگو چه کسی است؟</p>
          <h2 id="listeners-title">گوش‌دادن خوب اتفاقی نیست.</h2>
          <p>
            مسیر شنونده شامل آموزش نقش، گوش‌دادن فعال، مرزهای رفتاری، موقعیت‌های حساس و ارزیابی است. هدف این است که شنونده بداند چه کاری از او انتظار می‌رود و چه کاری از او خواسته نمی‌شود.
          </p>
        </div>
        <div className={styles.preparationGrid}>
          {listenerPreparation.map(([title, description]) => (
            <article className={styles.preparationItem} key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className={styles.profileTruth}>
          <strong>پروفایل، با تأیید پلتفرم یکی نیست.</strong>
          <p>
            بخشی از اطلاعات پروفایل می‌تواند نوشته‌ی خود فرد باشد. بررسی هویت، هرجا در فرایند مربوط اعمال شود، مرحله‌ای جداست؛ اطلاعات خوداظهاری نباید به شکل اطلاعات تأییدشده نمایش داده شود.
          </p>
        </div>
      </section>

      <section id="trust" className={styles.trustSection} aria-labelledby="trust-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>اعتماد از مرزهای روشن شروع می‌شود</p>
          <h2 id="trust-title">لازم نیست بیشتر از چیزی که می‌خواهید، از خودتان بگویید.</h2>
        </div>
        <div className={styles.trustLayout}>
          <div className={styles.trustPrinciples}>
            <article>
              <h3>موضوع گفت‌وگو دست شماست</h3>
              <p>شما تصمیم می‌گیرید چه چیزی را مطرح کنید. شنونده نباید برای گرفتن جزئیات شخصیِ غیرضروری فشار بیاورد.</p>
            </article>
            <article>
              <h3>رابطه شخصی خارج از سرویس هدف این محصول نیست</h3>
              <p>گفت‌وگو باید در چارچوب نقش شنونده بماند؛ نه تبدیل به وابستگی، قرار شخصی یا انتقال رابطه به کانال‌های خصوصی شود.</p>
            </article>
            <article>
              <h3>رفتار نامناسب پذیرفته نیست</h3>
              <p>آزار، تهدید، فشار جنسی، سوءاستفاده از اطلاعات شخصی یا عبور از مرزهای نقش با هدف این سرویس سازگار نیست.</p>
            </article>
          </div>
          <aside className={styles.boundaryCard}>
            <p className={styles.boundaryLabel}>مرز مهم</p>
            <h3>شنیده‌شدن با دریافت خدمات تخصصی فرق دارد.</h3>
            <p>این خدمت مشاوره، درمان، تشخیص پزشکی یا پاسخ اضطراری نیست.</p>
            <div className={styles.boundaryLinks}>
              <a href="/privacy">حریم خصوصی</a>
              <a href="/terms">قوانین استفاده</a>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.listenerPath} aria-labelledby="listener-path-title">
        <div>
          <p className={styles.eyebrow}>برای کسانی که می‌خواهند شنونده شوند</p>
          <h2 id="listener-path-title">خوب گوش‌دادن، مهارت است و مسئولیت دارد.</h2>
          <p>مسیر جداگانه‌ی شنونده برای یادگیری نقش، مرزها و ارزیابی آماده است. این مسیر به معنی تضمین پذیرش، کار یا درآمد نیست.</p>
        </div>
        <a className={styles.listenerAction} href="/listener">آشنایی با مسیر شنونده</a>
      </section>

      <section id="access" className={styles.accessSection} aria-labelledby="access-title">
        <div className={styles.accessCopy}>
          <p className={styles.eyebrow}>ورود به حساب</p>
          <h2 id="access-title">اگر حساب دارید، با ایمیل وارد شوید.</h2>
          <p>
            ورود با کد یک‌بارمصرف انجام می‌شود. ورود فعلاً مسیر گفت‌وگوی عمومی را باز نمی‌کند؛ اگر برای شنونده‌شدن آمده‌اید، بعد از ورود می‌توانید مسیر فعال آن را ادامه دهید.
          </p>
          <p className={styles.accessPrivacy}>
            جزئیات استفاده از اطلاعات حساب در <a href="/privacy">حریم خصوصی</a> آمده است.
          </p>
        </div>

        <div className={styles.loginPanel} aria-live="polite">
          {step === 'email' && (
            <form onSubmit={requestCode} className={styles.loginForm}>
              <div>
                <p className={styles.formEyebrow}>ورود امن با ایمیل</p>
                <h3>ایمیل شما</h3>
                <p className={styles.helper}>یک کد ۶ رقمی برای ورود به همین ایمیل می‌فرستیم.</p>
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

              {error && <p className={styles.error} role="alert">{error}</p>}

              <button className={styles.submitButton} type="submit" disabled={busy}>
                {busy ? 'در حال ارسال…' : 'دریافت کد ورود'}
              </button>

              <p className={styles.formPrivacy}>
                ایمیل برای ورود و امنیت حساب استفاده می‌شود. اطلاعات بیشتر در صفحه حریم خصوصی در دسترس است.
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

              <label htmlFor="code">کد ۶ رقمی</label>
              <input
                id="code"
                name="code"
                className={styles.codeInput}
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
              <button type="button" className={styles.textButton} onClick={editEmail} disabled={busy}>
                اصلاح ایمیل
              </button>
            </form>
          )}

          {step === 'verified' && (
            <div className={styles.verifiedState}>
              <p className={styles.formEyebrow}>ورود انجام شد</p>
              <h3>حساب شما باز است.</h3>
              <p className={styles.helper}>مسیر بعدی به دلیل آمدن شما به «یکی هست» بستگی دارد.</p>

              <div className={styles.verifiedChoice}>
                <div>
                  <strong>برای گفت‌وگو آمده‌اید؟</strong>
                  <p>گفت‌وگوی عمومی هنوز در دسترس نیست. لازم نیست وارد مسیر شنونده شوید؛ فعلاً مسیر دیگری برای شروع گفت‌وگو از این حساب وجود ندارد.</p>
                </div>
                <div>
                  <strong>برای شنونده‌شدن آمده‌اید؟</strong>
                  <p>آموزش و ارزیابی شنونده فعال است و می‌توانید همان مسیر را ادامه دهید.</p>
                  <a className={styles.primaryAction} href="/listener">ادامه مسیر شنونده</a>
                </div>
              </div>

              <button type="button" className={styles.textButton} onClick={() => void logout()}>خروج از حساب</button>
            </div>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>یکی هست</strong>
          <p>برای گفت‌وگویی که لازم نیست در آن نقش بازی کنید.</p>
        </div>
        <nav className={styles.footerLinks} aria-label="اطلاعات عمومی سرویس">
          <a href="/listener">شنونده‌شدن</a>
          <a href="/privacy">حریم خصوصی</a>
          <a href="/terms">قوانین استفاده</a>
          <a href="/account/delete">حذف حساب</a>
          <a href="mailto:sales@uniqueholding.com.tr">sales@uniqueholding.com.tr</a>
        </nav>
      </footer>
    </main>
  );
}
