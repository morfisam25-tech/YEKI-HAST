import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'پرسش‌های رایج | یکی هست',
  description: 'پاسخ‌های کوتاه درباره تماس، هزینه، حریم خصوصی و ایمنی یکی هست',
};

export default function FaqPage() {
  return (
    <main>
      <header className="site-header"><strong className="brand">یکی هست</strong><a href="/">برگشت به صفحه اصلی</a></header>
      <article className="legal-page" aria-labelledby="faq-title">
        <p className="kicker">پرسش‌های رایج</p>
        <h1 id="faq-title">پاسخ روشن به پرسش‌های اصلی</h1>
        <section className="legal-section"><h2>چه کسی می‌تواند استفاده کند؟</h2><p>فقط افراد ۱۸ سال و بالاتر.</p></section>
        <section className="legal-section"><h2>شنونده درمانگر است؟</h2><p>خیر. شنونده یک انسان واقعی برای گفت‌وگوست؛ سرویس درمانی، پزشکی، روان‌پزشکی، دوست‌یابی، اسکورت یا اضطراری نیست.</p></section>
        <section className="legal-section"><h2>تماس ضبط می‌شود؟</h2><p>بله. برای امنیت کاربران و رسیدگی به شکایت‌های احتمالی، پلتفرم مکالمه را ضبط و به‌صورت امن نگهداری می‌کند. این ضبط برای تبلیغات، پخش عمومی، دانلود توسط کاربران یا آموزش هوش مصنوعی استفاده نمی‌شود و شنونده به آن دسترسی ندارد؛ فقط تیم ایمنی مجاز پلتفرم می‌تواند در رسیدگی به شکایت آن را با مجوز و ثبت‌شده بررسی کند. ضبط یا بازپخش مستقل مکالمه توسط کاربران ممنوع است.</p></section>
        <section className="legal-section"><h2>اگر شنونده پاسخ ندهد چه می‌شود؟</h2><p>هزینه‌ای کسر نمی‌شود و مبلغ موقت کیف پول آزاد می‌شود.</p></section>
        <section className="legal-section"><h2>اطلاعات پروفایل تأیید شده است؟</h2><p>جزئیات عمومی خوداظهاری است مگر کنار همان فیلد صریحاً نوشته شده باشد که بررسی شده است.</p></section>
        <section className="legal-section"><h2>چطور گزارش یا بلاک کنم؟</h2><p>از ابزارهای خروج امن، گزارش و بلاک در مسیر تماس استفاده کنید و <a href="/safety">راهنمای ایمنی</a> را ببینید.</p></section>
      </article>
    </main>
  );
}
