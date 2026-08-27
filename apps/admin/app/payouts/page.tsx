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
  consistencyIssues: string[];
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

type ListedConsistency = {
  payoutCount: number;
  payoutsWithIssues: number;
  issueCount: number;
};

type PayoutCandidate = {
  listenerUserId: string;
  marketId: string;
  currencyCode: string;
  availableMinor: string;
  earningCount: number;
  oldestAvailableAt: string;
  kycStatus: string;
  candidateVersion: string;
};

type PendingEarningBacklog = {
  currencyCode: string;
  pendingMinor: string;
  earningCount: number;
  listenerCount: number;
  oldestPendingAt: string | null;
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

function consistencyLabel(code: string): string {
  const labels: Record<string, string> = {
    no_sources: 'payout بدون منبع',
    source_total_mismatch: 'جمع منابع با مبلغ payout برابر نیست',
    earning_market_mismatch: 'earning از market دیگری متصل شده',
    source_state_mismatch: 'وضعیت منبع با وضعیت payout سازگار نیست',
    provider_state_mismatch: 'وضعیت provider با payout سازگار نیست',
    paid_at_mismatch: 'paid_at با وضعیت payout سازگار نیست',
  };
  return labels[code] ?? code;
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [listedConsistency, setListedConsistency] = useState<ListedConsistency>({ payoutCount: 0, payoutsWithIssues: 0, issueCount: 0 });
  const [candidates, setCandidates] = useState<PayoutCandidate[]>([]);
  const [pendingBacklog, setPendingBacklog] = useState<PendingEarningBacklog[]>([]);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    const value = await api<{
      payouts: Payout[];
      listedConsistency: ListedConsistency;
      payoutCandidates: PayoutCandidate[];
      pendingEarningBacklog: PendingEarningBacklog[];
    }>(`/api/ops/payouts${qs}`);
    setPayouts(value.payouts);
    setListedConsistency(value.listedConsistency ?? { payoutCount: value.payouts.length, payoutsWithIssues: 0, issueCount: 0 });
    setCandidates(value.payoutCandidates ?? []);
    setPendingBacklog(value.pendingEarningBacklog ?? []);
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, [status]);

  async function prepare(candidate: PayoutCandidate) {
    if (busyId) return;
    const key = `${candidate.listenerUserId}:${candidate.marketId}:${candidate.currencyCode}`;
    if (!window.confirm('از همین earningهای available یک payout محلی ساخته شود؟ این کار هیچ انتقال بانکی یا provider call انجام نمی‌دهد.')) return;
    setBusyId(key);
    setError('');
    try {
      await api('/api/ops/payouts/prepare', {
        method: 'POST',
        body: JSON.stringify({
          listenerUserId: candidate.listenerUserId,
          marketId: candidate.marketId,
          currencyCode: candidate.currencyCode,
          expectedAvailableMinor: candidate.availableMinor,
          expectedEarningCount: candidate.earningCount,
          candidateVersion: candidate.candidateVersion,
        }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'request_failed');
    } finally {
      setBusyId(null);
    }
  }

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
        <div className="sectionHeader">
          <div>
            <p className="kicker">PENDING EARNINGS</p>
            <h2>درآمدهای هنوز آزاد‌نشده</h2>
          </div>
          <span className="statusPill">{pendingBacklog.reduce((sum, row) => sum + row.earningCount, 0).toLocaleString('fa-IR')}</span>
        </div>
        <p className="muted">این ارقام فقط backlog وضعیت `pending` هستند. از این بخش هیچ earning آزاد، payout-ready یا پرداخت نمی‌شود.</p>
        <div className="queue">
          {pendingBacklog.map((row) => (
            <article key={row.currencyCode} className="subPanel">
              <div className="sectionHeader">
                <div>
                  <p className="kicker">PENDING · {row.currencyCode}</p>
                  <h3>{formatAmount(row.pendingMinor, row.currencyCode)}</h3>
                </div>
                <span className="statusPill">HOLD</span>
              </div>
              <div className="facts compact">
                <p><b>Earnings:</b> {row.earningCount.toLocaleString('fa-IR')}</p>
                <p><b>Listeners:</b> {row.listenerCount.toLocaleString('fa-IR')}</p>
                <p><b>قدیمی‌ترین pending:</b> {row.oldestPendingAt ? new Date(row.oldestPendingAt).toLocaleString('fa-IR') : '—'}</p>
              </div>
            </article>
          ))}
          {!pendingBacklog.length && <p className="muted">earning در وضعیت pending وجود ندارد.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <p className="kicker">PAYOUT READY</p>
            <h2>درآمدهای available خارج از payout</h2>
          </div>
          <span className="statusPill">{candidates.length.toLocaleString('fa-IR')}</span>
        </div>
        <p className="muted">Prepare فقط earningهای همین snapshot را به payout با وضعیت `created` وصل می‌کند. `pending` دست نمی‌خورد و هیچ provider call یا انتقال بانکی انجام نمی‌شود.</p>
        <div className="queue">
          {candidates.map((candidate) => {
            const candidateKey = `${candidate.listenerUserId}:${candidate.marketId}:${candidate.currencyCode}`;
            return (
              <article key={candidateKey} className="subPanel">
                <div className="sectionHeader">
                  <div>
                    <p className="kicker">Listener {candidate.listenerUserId.slice(0, 8)}…</p>
                    <h3>{formatAmount(candidate.availableMinor, candidate.currencyCode)}</h3>
                  </div>
                  <span className="statusPill">{candidate.kycStatus === 'verified' ? 'READY' : 'KYC'}</span>
                </div>
                <div className="facts compact">
                  <p><b>Market:</b> {candidate.marketId.slice(0, 8)}…</p>
                  <p><b>Earnings:</b> {candidate.earningCount.toLocaleString('fa-IR')}</p>
                  <p><b>KYC:</b> {candidate.kycStatus}</p>
                  <p><b>قدیمی‌ترین available:</b> {new Date(candidate.oldestAvailableAt).toLocaleString('fa-IR')}</p>
                </div>
                <div className="actions">
                  <button disabled={Boolean(busyId)} onClick={() => prepare(candidate)}>
                    {busyId === candidateKey ? 'در حال آماده‌سازی…' : 'Prepare payout'}
                  </button>
                </div>
              </article>
            );
          })}
          {!candidates.length && <p className="muted">earning آماده و خارج از payout وجود ندارد.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <p className="kicker">PAYOUT CONSISTENCY</p>
            <h2>کنترل سازگاری payout و منابع</h2>
          </div>
          <span className="statusPill">{listedConsistency.payoutsWithIssues ? `${listedConsistency.payoutsWithIssues} WARN` : 'CLEAN'}</span>
        </div>
        <p className="muted">این کنترل فقط وضعیت‌های قطعی داخل دیتابیس را مقایسه می‌کند و هیچ repair یا تغییر مالی خودکار انجام نمی‌دهد.</p>
        <div className="facts compact">
          <p><b>Payoutهای بررسی‌شده:</b> {listedConsistency.payoutCount.toLocaleString('fa-IR')}</p>
          <p><b>Payout دارای هشدار:</b> {listedConsistency.payoutsWithIssues.toLocaleString('fa-IR')}</p>
          <p><b>کل هشدارها:</b> {listedConsistency.issueCount.toLocaleString('fa-IR')}</p>
        </div>
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
                <span className="statusPill">{payout.dispatchNeedsReconciliation ? 'RECONCILE' : payout.consistencyIssues.length ? 'CHECK' : payout.status}</span>
              </div>
              <div className="facts compact">
                <p><b>KYC:</b> {payout.kycStatus}</p>
                <p><b>منابع:</b> {payout.sourceCount.toLocaleString('fa-IR')}</p>
                <p><b>Provider:</b> {payout.provider ?? '—'}</p>
                <p><b>Listener ref:</b> {payout.listenerUserId.slice(0, 8)}…</p>
              </div>
              {payout.consistencyIssues.length > 0 && (
                <p className="error">Consistency: {payout.consistencyIssues.map(consistencyLabel).join(' · ')}</p>
              )}
              {payout.dispatchNeedsReconciliation && (
                <p className="error">Dispatch پاسخ قطعی نداده؛ دوباره Dispatch نکن. فقط Reconcile کن.</p>
              )}
              <p className="muted">ایجاد: {new Date(payout.createdAt).toLocaleString('fa-IR')}</p>
              <div className="actions">
                {payout.status === 'created' && (
                  <button disabled={busyId === payout.id || payout.kycStatus !== 'verified' || payout.consistencyIssues.length > 0} onClick={() => act(payout, 'dispatch')}>
                    {payout.consistencyIssues.length > 0 ? 'Consistency لازم است' : payout.kycStatus === 'verified' ? 'Dispatch' : 'KYC لازم است'}
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
