'use client';

import { useEffect, useState } from 'react';

type Payout = {
  id: string;
  listenerUserId: string;
  amountMinor: string;
  currencyCode: string;
  status: string;
  provider: string | null;
  dispatchNeedsReconciliation: boolean;
  sourceCount: number;
  kycStatus: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body as T;
}

function formatAmount(amountMinor: string, currencyCode: string): string {
  try {
    return `${BigInt(amountMinor).toLocaleString('fa-IR')} ${currencyCode}`;
  } catch {
    return `${amountMinor} ${currencyCode}`;
  }
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    const value = await api<{ payouts: Payout[] }>(`/api/ops/payouts${qs}`);
    setPayouts(value.payouts);
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, [status]);

  async function act(payout: Payout, action: 'dispatch' | 'reconcile') {
    if (busyId) return;
    const wording = action === 'dispatch' ? 'ارسال این پرداخت به درگاه بانکی انجام شود؟' : 'وضعیت این پرداخت از درگاه دوباره بررسی شود؟';
    if (!window.confirm(wording)) return;
    setBusyId(payout.id);
    setError('');
    try {
      await api(`/api/ops/payouts/${encodeURIComponent(payout.id)}/${action}`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'request_failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · PAYOUTS</p>
          <h1>عملیات پرداخت شنونده‌ها</h1>
          <p className="muted">این صفحه عمداً شماره شبا، نام صاحب حساب و اطلاعات بانکی خام را نمایش نمی‌دهد.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => { window.location.href = '/'; }}>داشبورد</button>
          <button className="ghost" onClick={() => load()} disabled={Boolean(busyId)}>به‌روزرسانی</button>
        </div>
      </header>

      <section className="panel">
        <div className="reviewRow wide">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Payout status filter">
            <option value="">همه وضعیت‌ها</option>
            <option value="created">آماده ارسال</option>
            <option value="processing">در حال پردازش</option>
            <option value="failed">نیازمند بررسی</option>
            <option value="paid">پرداخت‌شده</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="queue">
          {payouts.map((payout) => (
            <article key={payout.id} className="subPanel">
              <div className="sectionHeader">
                <div>
                  <p className="kicker">{payout.id.slice(0, 8)}</p>
                  <h3>{formatAmount(payout.amountMinor, payout.currencyCode)}</h3>
                </div>
                <span className="statusPill">{payout.dispatchNeedsReconciliation ? 'RECONCILE' : payout.status}</span>
              </div>
              <div className="facts compact">
                <p><b>KYC:</b> {payout.kycStatus}</p>
                <p><b>منابع:</b> {payout.sourceCount.toLocaleString('fa-IR')}</p>
                <p><b>Provider:</b> {payout.provider ?? '—'}</p>
                <p><b>Listener ref:</b> {payout.listenerUserId.slice(0, 8)}…</p>
              </div>
              {payout.dispatchNeedsReconciliation && (
                <p className="error">Dispatch پاسخ قطعی نداده؛ دوباره Dispatch نکن. فقط Reconcile کن.</p>
              )}
              <p className="muted">ایجاد: {new Date(payout.createdAt).toLocaleString('fa-IR')}</p>
              <div className="actions">
                {payout.status === 'created' && (
                  <button disabled={busyId === payout.id || payout.kycStatus !== 'verified'} onClick={() => act(payout, 'dispatch')}>
                    {payout.kycStatus === 'verified' ? 'Dispatch' : 'KYC لازم است'}
                  </button>
                )}
                {(payout.status === 'processing' || payout.status === 'failed') && (
                  <button className="ghost" disabled={busyId === payout.id} onClick={() => act(payout, 'reconcile')}>Reconcile</button>
                )}
              </div>
            </article>
          ))}
          {!payouts.length && <p className="muted">پرداختی در این وضعیت وجود ندارد.</p>}
        </div>
      </section>
    </main>
  );
}
