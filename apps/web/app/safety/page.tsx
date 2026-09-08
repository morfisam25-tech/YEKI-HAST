import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './safety.module.css';

export const metadata: Metadata = {
  title: 'مرکز ایمنی | یکی هست',
  description: 'راهنمای عملی مرزهای گفت‌وگو، رفتار نامناسب، پایان ایمن و وضعیت ابزارهای ایمنی یکی هست',
};

const conductItems = [
  {
    title: 'آزار و توهین',
    text: 'تحقیر، توهین هدفمند، آزار مداوم یا رفتاری که طرف مقابل را تحت فشار می‌گذارد قابل قبول نیست.',
  },
  {
    title: 'تهدید و اخاذی',
    text: 'تهدید، ارعاب، اخاذی یا تلاش برای ترساندن طرف مقابل با اطلاعات شخصی پذیرفته نیست.',
  },
  {
    title: 'درخواست جنسی یا نامناسب',
    text: 'درخواست جنسی، رفتار نامناسب یا تلاش برای تبدیل گفت‌وگو به رابطه‌ای خارج از چارچوب سرویس پذیرفته نیست.',
  },
  {
    title: 'فشار برای ارتباط بیرون از سرویس',
    text: 'اصرار برای گرفتن شماره تلفن، نشانی یا شناسه شبکه اجتماعی و ادامه رابطه خارج از «یکی هست» با قواعد سرویس سازگار نیست.',
  },
  {
    title: 'جعل نقش حرفه‌ای',
    text: 'شنونده نباید خودش را روان‌شناس، پزشک، درمانگر، وکیل یا متخصصی معرفی کند که نقش او در «یکی هست» چنین چیزی نیست.',
  },
  {
    title: 'نقض حریم خصوصی یا فریب',
    text: 'تلاش برای افشای اطلاعات خصوصی، فریب، کلاهبرداری یا استفاده از گفت‌وگو برای فعالیت غیرقانونی پذیرفته نیست.',
  },
];

export default function SafetyPage() {
  return (
    <main className={styles.page} dir="rtl">
      <header className={styles.header}>
        <Link className={styles.brand} href="/">یکی هست</Link>
        <nav className={styles.topNav} aria-label="ناوبری مرکز ایمنی">
          <Link href="/trust">اعتماد</Link>
          <Link href="/faq">پرسش‌های رایج</Link>
          <Link href="/">صفحه اصلی</Link>
        </nav>
      </header>

      <article className={styles.shell} aria-labelledby="safety-title">
        <section className={styles.hero}>
          <p className={styles.eyebrow}>مرکز ایمنی</p>
          <h1 id="safety-title">مرز گفت‌وگو باید روشن باشد.</h1>
          <p className={styles.lead}>
            قرار نیست برای ادامه یک گفت‌وگو تحت فشار بمانید. احترام به مرز شخصی، نخواستنِ تماس بیرون از سرویس و امکان تمام‌کردن گفت‌وگو بخشی از چارچوب «یکی هست» است.
          </p>
          <div className={styles.publicStatus} role="note">
            <strong>وضعیت فعلی:</strong>
            <span>گفت‌وگوی عمومی هنوز باز نشده است. توضیح ابزارهای تماس در این صفحه، وضعیت زیرساخت فعلی را شرح می‌دهد و به معنی در دسترس‌بودن عمومی امروز نیست.</span>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="conduct-title">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>رفتار</p>
            <h2 id="conduct-title">چه چیزی در گفت‌وگو قابل قبول نیست؟</h2>
            <p>اگر رفتار طرف مقابل از مرز احترام خارج شد، لازم نیست آن را عادی تلقی کنید.</p>
          </div>
          <div className={styles.conductGrid}>
            {conductItems.map((item) => (
              <article className={styles.conductCard} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="listener-boundaries">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>مرز نقش</p>
            <h2 id="listener-boundaries">شنونده چه کاری نباید انجام دهد؟</h2>
          </div>
          <div className={styles.boundaryBox}>
            <p>
              شنونده برای شنیدن و همراهی در گفت‌وگو است. نباید تشخیص پزشکی یا روان‌شناختی بدهد، نتیجه درمانی تضمین کند یا خودش را در نقش پزشک، روان‌شناس، درمانگر، وکیل یا نیروی امدادی جا بزند.
            </p>
            <p>
              همچنین نباید برای گرفتن شماره، شبکه اجتماعی، نشانی یا ادامه رابطه شخصی خارج از سرویس فشار وارد کند. همین مرز برای کاربر هم وجود دارد.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="ending-title">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>پایان گفت‌وگو</p>
            <h2 id="ending-title">پایان عادی با خروج ایمنی فرق دارد.</h2>
            <p>زیرساخت تماس این دو وضعیت را جدا نگه می‌دارد.</p>
          </div>
          <div className={styles.endingGrid}>
            <article className={styles.endingCard}>
              <span className={styles.label}>پایان عادی</span>
              <h3>وقتی فقط می‌خواهید مکالمه تمام شود</h3>
              <p>
                پیاده‌سازی فعلی اجازه می‌دهد هر شرکت‌کننده تماس را پایان دهد. تمام‌کردن گفت‌وگو به‌خودی‌خود به معنی ثبت مسئله ایمنی نیست.
              </p>
            </article>
            <article className={`${styles.endingCard} ${styles.safetyEnding}`}>
              <span className={styles.label}>خروج ایمنی</span>
              <h3>وقتی ادامه تماس برایتان امن یا قابل قبول نیست</h3>
              <p>
                مسیر جداگانه خروج ایمنی می‌تواند تماس را با وضعیت ایمنی پایان دهد و در صورت انتخاب کاربر، طرف مقابل را نیز بلاک کند.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="tools-title">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>ابزارها</p>
            <h2 id="tools-title">گزارش و بلاک در زیرساخت تماس وجود دارد.</h2>
            <p>اما چون گفت‌وگوی عمومی بسته است، این بخش را قابلیت عمومیِ امروز معرفی نمی‌کنیم.</p>
          </div>
          <div className={styles.toolsList}>
            <div>
              <h3>گزارش رفتار</h3>
              <p>
                backend فعلی برای شرکت‌کننده تماس امکان گزارش رفتار را دارد. دسته‌های تعریف‌شده شامل رفتار جنسی، آزار، توهین، تهدید، درخواست ارتباط خارج از سرویس، نقض حریم خصوصی، کلاهبرداری، توصیه ناامن و رفتار نامناسب است.
              </p>
            </div>
            <div>
              <h3>بلاک طرف مقابل</h3>
              <p>
                شرکت‌کننده تماس می‌تواند طرف مقابل همان تماس را بلاک کند. مسیر خروج ایمنی نیز می‌تواند همراه با بلاک انجام شود.
              </p>
            </div>
            <div>
              <h3>جزئیات گزارش</h3>
              <p>
                اگر توضیح متنی برای گزارش یا رویداد ایمنی ثبت شود، پیاده‌سازی فعلی آن را به‌صورت رمزگذاری‌شده در بخش داده خصوصی ذخیره می‌کند.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="contact-pressure">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>ارتباط بیرون از سرویس</p>
            <h2 id="contact-pressure">«شماره‌ات را بده» یک درخواست بی‌اهمیت نیست.</h2>
          </div>
          <div className={styles.practicalBox}>
            <p>
              قوانین استفاده، درخواست یا انتشار شماره تلفن، نشانی و شناسه شبکه اجتماعی برای ادامه رابطه خارج از «یکی هست» را نمی‌پذیرد. اگر طرف مقابل اصرار کرد، لازم نیست برای مؤدب‌بودن اطلاعاتتان را بدهید یا گفت‌وگو را ادامه دهید.
            </p>
          </div>
        </section>

        <section className={styles.emergency} aria-labelledby="emergency-title">
          <p className={styles.eyebrow}>خطر فوری</p>
          <h2 id="emergency-title">«یکی هست» سرویس پاسخ اضطراری نیست.</h2>
          <p>
            اگر شما یا شخص دیگری در خطر فوری هستید، به‌جای منتظرماندن برای شنونده، از خدمات اضطراری معتبرِ محل خود یا یک فرد قابل اعتماد که می‌تواند همان لحظه کمک عملی کند استفاده کنید.
          </p>
          <p>
            این صفحه شماره اضطراری واحدی پیشنهاد نمی‌کند، چون شماره‌ها و خدمات معتبر بسته به کشور و محل شما متفاوت‌اند.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="account-action">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>حساب</p>
            <h2 id="account-action">رفتار خطرناک می‌تواند روی دسترسی حساب اثر بگذارد.</h2>
          </div>
          <div className={styles.boundaryBox}>
            <p>
              طبق قوانین استفاده، برای حفاظت از کاربران ممکن است دسترسی یک حساب یا امکان حضور آن در سرویس موقت یا دائم محدود شود و اطلاعات لازم برای بررسی ایمنی نگهداری شود. این متن زمان پاسخ یا نتیجه مشخصی برای گزارش‌ها وعده نمی‌دهد.
            </p>
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            <strong>برای جزئیات حقوقی و داده‌ای</strong>
            <p>مرکز ایمنی جای سیاست حریم خصوصی یا قوانین استفاده را نمی‌گیرد.</p>
          </div>
          <nav aria-label="پیوندهای ایمنی">
            <Link href="/terms">قوانین استفاده</Link>
            <Link href="/privacy">حریم خصوصی</Link>
            <Link href="/trust">مرکز اعتماد</Link>
            <Link href="/faq">پرسش‌های رایج</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}
