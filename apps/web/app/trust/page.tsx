import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './trust.module.css';

export const metadata: Metadata = {
  title: 'مرکز اعتماد | یکی هست',
  description: 'پاسخ روشن درباره شنونده‌ها، اطلاعات پروفایل، گفت‌وگو، ابزارهای ایمنی و قابلیت‌های فعلی یکی هست',
};

const currentCapabilities = [
  'ورود با ایمیل و امنیت حساب',
  'ثبت‌نام، آموزش و ارزیابی متقاضی شنونده‌شدن',
  'حذف حساب',
  'پشتیبانی',
];

const closedCapabilities = [
  'گفت‌وگوی صوتی عمومی',
  'رزرو شنونده',
  'پرداخت و تسویه عمومی',
  'احراز هویت بیرونی برای مسیر عمومی',
  'ورود با پیامک',
];

export default function TrustPage() {
  return (
    <main className={styles.page} dir="rtl">
      <header className={styles.header}>
        <Link className={styles.brand} href="/">یکی هست</Link>
        <nav className={styles.topNav} aria-label="ناوبری مرکز اعتماد">
          <Link href="/safety">ایمنی</Link>
          <Link href="/faq">پرسش‌های رایج</Link>
          <Link href="/">صفحه اصلی</Link>
        </nav>
      </header>

      <article className={styles.shell} aria-labelledby="trust-title">
        <section className={styles.hero}>
          <p className={styles.eyebrow}>مرکز اعتماد</p>
          <h1 id="trust-title">قبل از اعتماد، حق دارید دقیق بدانید چه چیزی واقعاً وجود دارد.</h1>
          <p className={styles.lead}>
            این صفحه قول اضافه نمی‌دهد. توضیح می‌دهد «یکی هست» چیست، شنونده چه مسیری را می‌گذراند، چه داده‌ای نمایشی است و کدام قابلیت‌ها هنوز برای عموم باز نشده‌اند.
          </p>
          <div className={styles.status} role="note" aria-label="وضعیت فعلی سرویس">
            <strong>وضعیت فعلی</strong>
            <span>گفت‌وگوی عمومی و رزرو شنونده هنوز برای استفاده همگانی باز نیست.</span>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="what-is-it">
          <div className={styles.sectionHeading}>
            <p className={styles.index}>01</p>
            <div>
              <h2 id="what-is-it">«یکی هست» دقیقاً چیست؟</h2>
              <p>فضایی برای گفت‌وگوی محترمانه با یک شنونده انسانی.</p>
            </div>
          </div>
          <div className={styles.prose}>
            <p>
              نقش شنونده، شنیدن و همراهی در چارچوب گفت‌وگو است. شنونده قرار نیست جای روان‌شناس، پزشک، درمانگر، وکیل یا نیروی امدادی را بگیرد و نباید خودش را در این نقش‌ها معرفی کند.
            </p>
            <p>
              این سرویس برای دوست‌یابی یا انتقال رابطه به شماره تلفن، شبکه اجتماعی یا ارتباط خارج از «یکی هست» طراحی نشده است.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="listener-prep">
          <div className={styles.sectionHeading}>
            <p className={styles.index}>02</p>
            <div>
              <h2 id="listener-prep">شنونده چه آمادگی‌ای می‌بیند؟</h2>
              <p>آموزش و ارزیابی بخشی از مسیر متقاضی شنونده‌شدن است.</p>
            </div>
          </div>
          <div className={styles.evidenceGrid}>
            <div className={styles.evidenceCard}>
              <span>آموزش</span>
              <h3>چهار موضوع مشخص</h3>
              <p>گوش‌دادن فعال، مرز نقش، ایمنی و قواعد پلتفرم.</p>
            </div>
            <div className={styles.evidenceCard}>
              <span>ارزیابی</span>
              <h3>بعد از آموزش</h3>
              <p>آماده‌بودن متقاضی در مرحله ارزیابی سنجیده می‌شود؛ گذراندن صرفِ فرم ثبت‌نام کافی نیست.</p>
            </div>
            <div className={styles.evidenceCard}>
              <span>بررسی هویت</span>
              <h3>فقط وقتی همان مرحله باز باشد</h3>
              <p>زیرساخت بررسی هویت وجود دارد، اما احراز هویت بیرونی در مسیر عمومی فعلی فعال نیست.</p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="verified-meaning">
          <div className={styles.sectionHeading}>
            <p className={styles.index}>03</p>
            <div>
              <h2 id="verified-meaning">«تأییدشده» یعنی چه؟</h2>
              <p>فقط همان چیزی که صریحاً بررسی شده؛ نه تمام حرف‌های یک پروفایل.</p>
            </div>
          </div>
          <div className={styles.prose}>
            <p>
              در پیاده‌سازی فعلی، وضعیت آماده‌به‌کار شنونده به تأیید پروفایل و وضعیت تأییدشده بررسی هویت وابسته است. چون بررسی هویت بیرونی فعلاً برای مسیر عمومی باز نیست، این توضیح به معنی وجود یک نشان عمومی فعال برای کاربران امروز نیست.
            </p>
            <p>
              معرفی کوتاه، سبک شنیدن و اطلاعاتی که فرد خودش وارد می‌کند «خوداظهاری» است، مگر اینکه کنار همان مورد صریحاً گفته شود بررسی شده است. عبارت «تأییدشده» نباید به تجربه، مدرک حرفه‌ای یا درست‌بودن همه ادعاهای فرد تعمیم داده شود.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="profile-info">
          <div className={styles.sectionHeading}>
            <p className={styles.index}>04</p>
            <div>
              <h2 id="profile-info">طرف مقابل چه اطلاعاتی می‌بیند؟</h2>
              <p>اطلاعات نمایشی با اطلاعات هویتی و بانکی یکی نیست.</p>
            </div>
          </div>
          <div className={styles.split}>
            <div className={styles.plainCard}>
              <h3>در طراحی فهرست شنونده‌ها</h3>
              <p>
                نام نمایشی، جنسیت، زبان‌ها و سطح تسلط، معرفی کوتاه و سبک شنیدن از اطلاعات نمایشی پروفایل‌اند. داده‌های عملکردی مانند وضعیت حضور یا امتیاز نیز در زیرساخت این فهرست وجود دارد.
              </p>
            </div>
            <div className={styles.plainCard}>
              <h3>برای نمایش عمومی نیست</h3>
              <p>
                اطلاعات هویتی و بانکی شنونده برای نمایش عمومی نیست. ایمیل و شماره تماس نیز در پاسخ فهرست عمومی شنونده‌ها به‌عنوان فیلد پروفایل برگردانده نمی‌شوند.
              </p>
            </div>
          </div>
          <p className={styles.inlineNote}>
            درخواست یا انتشار شماره تلفن، نشانی یا شناسه شبکه اجتماعی برای ادامه ارتباط خارج از سرویس طبق قوانین استفاده پذیرفته نیست.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="audio">
          <div className={styles.sectionHeading}>
            <p className={styles.index}>05</p>
            <div>
              <h2 id="audio">با صدا چه اتفاقی می‌افتد؟</h2>
              <p>امروز کاربر عمومی وارد گفت‌وگوی صوتی نمی‌شود.</p>
            </div>
          </div>
          <div className={styles.prose}>
            <p>
              قابلیت گفت‌وگوی صوتی در کد وجود دارد، اما مسیر عمومی آن بسته است. بنابراین در وضعیت فعلی، کاربر عادی از مسیر عمومی وارد تماس صوتی نمی‌شود و صدای مکالمه از این قابلیت جمع‌آوری یا منتقل نمی‌شود.
            </p>
            <p>
              طراحی فعلی برای انتقال زنده صدا از WebRTC استفاده می‌کند. در backend فعلی مسیری برای ضبط یا ذخیره محتوای صوتی مکالمه وجود ندارد؛ وضعیت و زمان تماس و سیگنال‌های فنی موقت لازم برای اتصال پردازش می‌شوند. این توضیح وضعیت پیاده‌سازی فعلی است، نه وعده‌ای درباره نسخه‌های آینده.
            </p>
            <p>
              جزئیات داده و دسترسی میکروفن در <Link href="/privacy">سیاست حریم خصوصی</Link> آمده است.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="control">
          <div className={styles.sectionHeading}>
            <p className={styles.index}>06</p>
            <div>
              <h2 id="control">اگر گفت‌وگو مناسب نبود چه کنترلی وجود دارد؟</h2>
              <p>زیرساخت تماس مسیر پایان عادی و خروج ایمنی را جدا کرده است.</p>
            </div>
          </div>
          <div className={styles.prose}>
            <p>
              پیاده‌سازی فعلی تماس اجازه پایان‌دادن گفت‌وگو را به شرکت‌کننده می‌دهد. برای موقعیت ایمنی، مسیر جداگانه‌ای برای پایان فوری وجود دارد که می‌تواند همراه با بلاک‌کردن طرف مقابل استفاده شود.
            </p>
            <p>
              گزارش‌کردن رفتار نامناسب و بلاک‌کردن طرف مقابل نیز در backend تماس پیاده‌سازی شده است. دسته‌های گزارش شامل آزار، تهدید، رفتار جنسی، درخواست ارتباط خارج از سرویس، نقض حریم خصوصی و کلاهبرداری است.
            </p>
            <p className={styles.inlineNote}>
              چون گفت‌وگوی عمومی هنوز باز نیست، این ابزارها را به‌عنوان قابلیت عمومیِ در دسترس امروز معرفی نمی‌کنیم. جزئیات رفتاری و شرایط خطر فوری در <Link href="/safety">مرکز ایمنی</Link> آمده است.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="delete-account">
          <div className={styles.sectionHeading}>
            <p className={styles.index}>07</p>
            <div>
              <h2 id="delete-account">حذف حساب چطور کار می‌کند؟</h2>
              <p>اول مالکیت ایمیل تأیید می‌شود، بعد درخواست حذف ثبت می‌شود.</p>
            </div>
          </div>
          <div className={styles.prose}>
            <p>
              اگر سابقه‌ای وجود نداشته باشد که نگهداری آن لازم باشد، حذف همان‌جا کامل می‌شود و نشست‌های فعال بسته می‌شوند. اگر سابقه مالی، ایمنی، گزارش یا رابطه عملیاتی دیگری نیاز به بررسی داشته باشد، نشست‌ها بسته می‌شوند اما تکمیل حذف تا پایان همان بررسی ادامه پیدا می‌کند.
            </p>
            <p><Link className={styles.textLink} href="/account/delete">رفتن به صفحه حذف حساب</Link></p>
          </div>
        </section>

        <section className={styles.availability} aria-labelledby="availability-title">
          <div>
            <p className={styles.eyebrow}>قابلیت‌های فعلی</p>
            <h2 id="availability-title">چه چیزی الان عمومی است و چه چیزی نیست؟</h2>
          </div>
          <div className={styles.availabilityColumns}>
            <div>
              <h3>فعال در مسیر عمومی</h3>
              <ul>
                {currentCapabilities.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h3>هنوز عمومی نیست</h3>
              <ul>
                {closedCapabilities.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            <strong>متن حقوقی و راهنمای عملی را جدا نگه داشته‌ایم.</strong>
            <p>برای جزئیات رسمی، خود سیاست‌ها را بخوانید.</p>
          </div>
          <nav aria-label="پیوندهای اعتماد">
            <Link href="/privacy">حریم خصوصی</Link>
            <Link href="/terms">قوانین استفاده</Link>
            <Link href="/safety">ایمنی</Link>
            <Link href="/faq">پرسش‌های رایج</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}
