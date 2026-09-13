import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ایمنی | یکی هست',
  description: 'ابزارها و مرزبندی ایمنی تماس در یکی هست',
};

export default function SafetyPage() {
  return (
    <main>
      <header className="site-header"><strong className="brand">یکی هست</strong><a href="/">برگشت به صفحه اصلی</a></header>
      <article className="legal-page" aria-labelledby="safety-title">
        <p className="kicker">ایمنی تماس</p>
        <h1 id="safety-title">کنترل پایان تماس در دست شماست.</h1>
        <p className="legal-lead">
          سرویس فقط برای افراد ۱۸ سال و بالاتر است. در خطر فوری، تماس را پایان دهید و از خدمات اضطراری یا مرجع مناسب
          محل زندگی خود کمک بگیرید؛ «یکی هست» سرویس اضطراری نیست.
        </p>

        <section className="legal-section">
          <h2>در تماس</h2>
          <ul>
            <li>«پایان تماس» گفت‌وگو را به‌صورت عادی متوقف می‌کند.</li>
            <li>«خروج امن» تماس را فوراً برای ایمنی پایان می‌دهد و در مسیر فعلی می‌تواند طرف مقابل را بلاک کند.</li>
            <li>ضبط تماس توسط پلتفرم خاموش است؛ تصور نکنید صدای تماس برای گزارش بعدی موجود خواهد بود.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>بعد از تماس</h2>
          <p>
            در مسیرهای تماس می‌توانید گزارش یا بلاک ثبت کنید. گزارش‌ها در صف ایمنی ثبت می‌شوند و می‌توانند برای بررسی
            به مدیر واگذار و سپس حل یا رد شوند. بررسی از متن گزارش، اطلاعات حساب، فراداده نشست و تماس و سابقه ایمنی،
            گزارش یا بلاک استفاده می‌کند؛ نه از صدای تماس.
          </p>
        </section>

        <section className="legal-section">
          <h2>رفتار ممنوع</h2>
          <p>
            تهدید، آزار، فریب، اخاذی، سوءاستفاده جنسی، افشای اطلاعات خصوصی و تلاش برای انتقال رابطه به بیرون از سرویس
            از طریق درخواست اطلاعات تماس شخصی ممنوع است. دسترسی حساب می‌تواند برای حفاظت از کاربران محدود شود.
          </p>
        </section>

        <section className="legal-section">
          <h2>ایمنی کودک و تماس پشتیبانی</h2>
          <p>
            <a href="/safety/children">استانداردهای ایمنی کودک</a> را بخوانید. برای گزارش خارج از ابزار داخل محصول،
            به <a href="mailto:sales@uniqueholding.com.tr">sales@uniqueholding.com.tr</a> ایمیل بزنید.
          </p>
        </section>
      </article>
    </main>
  );
}
