'use client';

import { useEffect, useState } from 'react';

type Attempt = {
  id: string;
  userId: string;
  provider: string;
  currencyCode: string;
  amountMinor: string;
  providerFeeMinor: string;
  status: string;
  providerPaymentReference: string | null;
  createdAt: string;
  completedAt: string | null;
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body as T;
}

function short(value: string | null): string {
  return value ? `${value.slice(0, 8)}…` : '—';
}

function amount(value: string, currency: string): string {
  try { return `${BigInt(value).toLocaleString('fa-IR')} ${currency}`; }
  catch { return `${value} ${currency}`; }
}

export default function PaymentsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    const value = await api<{ attempts: Attempt[] }>(`/api/ops/payment-attempts${qs}`);
    setAttempts(value.attempts);
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, [status]);

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · PAYMENTS</p>
          <h1>مانیتورینگ شارژ کیف پول</h1>
          <p className="muted">این صفحه فقط وضعیت پرداخت را نشان می‌دهد. هیچ دکمه‌ای برای شارژ دستی یا bypass کردن تأیید درگاه وجود ندارد.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => load()}>به‌روزرسانی</button>
        </div>
      </header>

      <section className="panel">
        <div className="reviewRow wide">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Payment attempt status filter">
            <option value="pending">در انتظار تأیید</option>
            <option value="failed">ناموفق</option>
            <option value="cancelled">لغوشده</option>
            <option value="succeeded">موفق</option>
            <option value="">همه وضعیت‌ها</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="queue">
          {attempts.map((item) => (
            <article key={item.id} className="subPanel">
              <div className="sectionHeader">
                <div><p className="kicker">{short(item.id)}</p><h3>{amount(item.amountMinor, item.currencyCode)}</h3></div>
                <span className="statusPill">{item.status}</span>
              </div>
              <div className="facts compact">
                <p><b>User:</b> {short(item.userId)}</p>
                <p><b>Provider:</b> {item.provider}</p>
                <p><b>Provider ref:</b> {short(item.providerPaymentReference)}</p>
                <p><b>Fee:</b> {amount(item.providerFeeMinor, item.currencyCode)}</p>
              </div>
              <p className="muted">ایجاد: {new Date(item.createdAt).toLocaleString('fa-IR')}</p>
              {item.completedAt && <p className="muted">پایان: {new Date(item.completedAt).toLocaleString('fa-IR')}</p>}
            </article>
          ))}
          {!attempts.length && <p className="muted">موردی در این وضعیت وجود ندارد.</p>}
        </div>
      </section>
    </main>
  );
}
