const cards = [
  ['Applicants', '0'],
  ['Approved listeners', '0'],
  ['Online now', '0'],
  ['Live calls', '0'],
  ['Safety events', '0'],
  ['Caller waitlist', '0'],
];

export default function AdminPage() {
  return (
    <main>
      <h1>یکی هست / عملیات</h1>
      <p>اسکلت اولیه پنل ادمین. داده‌ها فعلاً نمونه‌اند.</p>
      <section className="grid">
        {cards.map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}
      </section>
      <section className="panel">
        <h2>Launch readiness</h2>
        <ul>
          <li>Masked calling proof: pending</li>
          <li>Online payment: pending</li>
          <li>Listener onboarding: scaffolded</li>
          <li>Caller waitlist: scaffolded</li>
          <li>Safety/reporting: domain rules pending implementation</li>
        </ul>
      </section>
    </main>
  );
}
