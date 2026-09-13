import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../safety.module.css';

export const metadata: Metadata = {
  title: 'استانداردهای ایمنی کودک | یکی هست',
  description: 'استانداردهای عمومی یکی هست درباره سوءاستفاده و بهره‌کشی جنسی از کودکان، گزارش، رسیدگی و همکاری با مراجع قانونی',
};

export default function ChildSafetyStandardsPage() {
  return (
    <main className={styles.page} dir="rtl">
      <header className={styles.header}>
        <Link className={styles.brand} href="/">یکی هست</Link>
        <nav className={styles.topNav} aria-label="ناوبری ایمنی کودک">
          <Link href="/safety">مرکز ایمنی</Link>
          <Link href="/terms">قوانین استفاده</Link>
          <Link href="/">صفحه اصلی</Link>
        </nav>
      </header>

      <article className={styles.shell} aria-labelledby="child-safety-title">
        <section className={styles.hero}>
          <p className={styles.eyebrow}>استانداردهای ایمنی کودک</p>
          <h1 id="child-safety-title">سوءاستفاده و بهره‌کشی جنسی از کودکان در «یکی هست» ممنوع است.</h1>
          <p className={styles.lead}>
            «یکی هست» برای کاربران ۱۸ سال و بالاتر طراحی شده است. با این حال، هر گزارش یا نشانه مربوط به سوءاستفاده و بهره‌کشی جنسی از کودکان یا محتوای سوءاستفاده جنسی از کودک با اولویت ایمنی بررسی می‌شود.
          </p>
          <div className={styles.publicStatus} role="note">
            <strong>دامنه این استاندارد:</strong>
            <span>این ممنوعیت شامل تلاش برای آزار، فریب یا آماده‌سازی جنسی کودک، درخواست یا مبادله محتوای جنسی مربوط به کودک، تسهیل بهره‌کشی و هر رفتار مشابه است.</span>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="prohibited-title">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>ممنوعیت صریح</p>
            <h2 id="prohibited-title">چه رفتارهایی پذیرفته نیست؟</h2>
          </div>
          <div className={styles.boundaryBox}>
            <p>ایجاد، درخواست، ارسال، ذخیره، توزیع یا تسهیل محتوای سوءاستفاده جنسی از کودک (CSAM) در ارتباط با سرویس ممنوع است.</p>
            <p>استفاده از سرویس برای برقراری ارتباط جنسی با کودک، فریب یا آماده‌سازی او برای سوءاستفاده، اخاذی جنسی، قاچاق یا بهره‌کشی از کودک ممنوع است.</p>
            <p>تلاش برای دورزدن این استاندارد، انتقال ارتباط به بیرون از سرویس برای ادامه چنین رفتاری یا کمک به فرد دیگری برای انجام آن نیز ممنوع است.</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="report-title">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>گزارش</p>
            <h2 id="report-title">گزارش ایمنی را جدی بررسی می‌کنیم.</h2>
            <p>در تماس‌هایی که مسیر گزارش در دسترس است، کاربر می‌تواند همان‌جا رفتار نامناسب را گزارش کند. برای گزارش خارج از تماس نیز کانال پشتیبانی عمومی در دسترس است.</p>
          </div>
          <div className={styles.practicalBox}>
            <p>
              برای گزارش نگرانی مرتبط با ایمنی کودک، از داخل سرویس در صورت در دسترس‌بودن ابزار گزارش استفاده کنید یا به
              {' '}<a href="mailto:sales@uniqueholding.com.tr">sales@uniqueholding.com.tr</a>{' '}
              ایمیل بزنید و در موضوع ایمیل عبارت «Child Safety» را بنویسید. اطلاعات حساس یا تصویر غیرضروری را دوباره ارسال نکنید.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="action-title">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>رسیدگی</p>
            <h2 id="action-title">پس از آگاهی واقعی از CSAM یا سوءاستفاده چه می‌کنیم؟</h2>
          </div>
          <div className={styles.boundaryBox}>
            <p>دسترسی یا حساب مرتبط می‌تواند برای جلوگیری از ادامه آسیب محدود یا مسدود شود و شواهد لازم مطابق الزامات قانونی حفظ شود.</p>
            <p>محتوای غیرقانونی در صورت وجود و امکان کنترل توسط سرویس حذف یا دسترسی به آن متوقف می‌شود.</p>
            <p>موارد تأییدشده طبق قوانین قابل‌اعمال به NCMEC یا مرجع منطقه‌ای مربوط گزارش می‌شود و در صورت الزام قانونی با مراجع ذی‌صلاح همکاری می‌کنیم.</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="contact-title">
          <div className={styles.sectionIntro}>
            <p className={styles.step}>نقطه تماس</p>
            <h2 id="contact-title">نقطه تماس ایمنی کودک</h2>
          </div>
          <div className={styles.practicalBox}>
            <p>
              Google Play و مراجع ذی‌صلاح می‌توانند برای موضوعات CSAE/CSAM از طریق
              {' '}<a href="mailto:sales@uniqueholding.com.tr">sales@uniqueholding.com.tr</a>{' '}
              با اپراتور «یکی هست» تماس بگیرند. این کانال برای ارجاع موضوع به مسئول رسیدگی و اقدام عملی استفاده می‌شود.
            </p>
          </div>
        </section>

        <section className={styles.emergency} aria-labelledby="danger-title">
          <p className={styles.eyebrow}>خطر فوری</p>
          <h2 id="danger-title">اگر کودکی در خطر فوری است، منتظر پاسخ پلتفرم نمانید.</h2>
          <p>با خدمات اضطراری یا مرجع حفاظت از کودک در محل خود تماس بگیرید. گزارش به «یکی هست» جای تماس فوری با مرجع مناسب در شرایط خطر را نمی‌گیرد.</p>
        </section>
      </article>
    </main>
  );
}
