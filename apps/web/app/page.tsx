export default function Page() {
  return (
    <main>
      <header><strong>یکی هست</strong></header>
      <section className="hero">
        <p className="kicker">برای وقتی که فقط یک آدم واقعی می‌خواهی</p>
        <h1>دلت می‌خواد با یکی حرف بزنی؟</h1>
        <p>سرویس مکالمه به‌زودی باز می‌شود. می‌توانی برای شروع در لیست انتظار باشی.</p>
        <form className="form">
          <input aria-label="شماره موبایل" placeholder="09..." inputMode="tel" />
          <button type="button">شروع شد خبرم کن</button>
        </form>
      </section>
      <section className="panel">
        <p className="kicker">همکاری دورکار</p>
        <h2>شنونده خوبی هستی؟</h2>
        <p>اول کار و آموزش را ببین. مدارک هویتی فقط بعد از قبولی و برای شروع همکاری لازم می‌شود و برای Caller نمایش داده نمی‌شود.</p>
        <button type="button">درخواست همکاری به‌عنوان شنونده</button>
      </section>
    </main>
  );
}
