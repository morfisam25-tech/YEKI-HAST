'use client';

import { useEffect, useState } from 'react';

type DeletionRequest = {
  userId: string;
  processingState: string;
};

type Response = {
  ok: boolean;
  requests: DeletionRequest[];
  piiIncluded: boolean;
};

async function loadRequests(): Promise<Response> {
  const response = await fetch('/api/ops/account-deletion-requests', { cache: 'no-store' });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body as Response;
}

export default function AccountDeletionsPage() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setData(await loadRequests());
  }

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed'));
  }, []);

  const pending = data?.requests.filter((item) => item.processingState === 'pending') ?? [];

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · PRIVACY OPS</p>
          <h1>درخواست‌های حذف حساب</h1>
          <p className="muted">
            این صف فقط شناسه داخلی کاربر و وضعیت پردازش را نشان می‌دهد. ایمیل، شماره تماس و داده هویتی در این endpoint برگردانده نمی‌شود.
          </p>
        </div>
        <div className="actions"><button className="ghost" onClick={() => void load()}>به‌روزرسانی</button></div>
      </header>

      <section className="panel">
        {error && <p className="error">{error}</p>}
        {!data ? (
          <p className="muted">در حال خواندن صف…</p>
        ) : (
          <>
            <div className="sectionHeader">
              <div>
                <p className="kicker">PENDING REQUESTS</p>
                <h2>{pending.length}</h2>
              </div>
              <span className="statusPill">PII NOT INCLUDED</span>
            </div>

            {pending.length === 0 ? (
              <p className="muted">درخواست حذف pending وجود ندارد.</p>
            ) : (
              <div className="grid">
                {pending.map((item) => (
                  <article key={item.userId}>
                    <small>USER ID</small>
                    <strong dir="ltr">{item.userId}</strong>
                    <p className="muted">وضعیت: {item.processingState}</p>
                  </article>
                ))}
              </div>
            )}

            <p className="muted">
              این صفحه عمداً عملیات «حذف نهایی» ندارد. ناشناس‌سازی یا حذف فیزیکی فقط بعد از تعیین retention برای سوابق مالی، ایمنی و سایر سوابق ضروری باید اجرا شود.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
