'use client';

import { useEffect, useState } from 'react';
import styles from './payments.module.css';

type Attempt = {
  id: string;
  userId: string;
  provider: string;
  currencyCode: string;
  amountMinor: string;
  providerFeeMinor: string;
  status: string;
  providerReferencePresent: boolean;
  initializationAmbiguous: boolean;
  createdAt: string;
  completedAt: string | null;
};

type CreditResult = {
  transactionId: string;
  targetUserId: string;
  amountMinor: string;
  currencyCode: string;
  balanceMinor: string;
  availableMinor: string;
  operationType: 'INTERNAL_BETA_ADMIN_CREDIT';
  idempotent: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
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
  const [targetUserId, setTargetUserId] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [currencyCode, setCurrencyCode] = useState('IRR');
  const [reason, setReason] = useState('');
  const [creditKey, setCreditKey] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState('');
  const [creditResult, setCreditResult] = useState<CreditResult | null>(null);

  async function load() {
    setError('');
    const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    const value = await api<{ attempts: Attempt[] }>(`/api/ops/payment-attempts${qs}`);
    setAttempts(value.attempts);
  }

  useEffect(() => {
    setCreditKey(crypto.randomUUID());
  }, []);

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, [status]);

  async function creditWallet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creditBusy) return;
    setCreditBusy(true);
    setCreditError('');
    setCreditResult(null);
    try {
      const idempotencyKey = creditKey || crypto.randomUUID();
      const result = await api<CreditResult>('/api/ops/wallet-credits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId, amountMinor, currencyCode, reason, idempotencyKey }),
      });
      setCreditResult(result);
      setCreditKey(idempotencyKey);
    } catch (cause) {
      setCreditError(cause instanceof Error ? cause.message : 'request_failed');
    } finally {
      setCreditBusy(false);
    }
  }

  function resetCreditForm() {
    setTargetUserId('');
    setAmountMinor('');
    setReason('');
    setCreditError('');
    setCreditResult(null);
    setCreditKey(crypto.randomUUID());
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · PAYMENTS</p>
          <h1>عملیات کیف پول</h1>
          <p className="muted">پرداخت‌های درگاه فقط مانیتور می‌شوند. اعتبار تست داخلی از مسیر جداگانه و ثبت‌شده در ledger انجام می‌شود.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => load()}>به‌روزرسانی</button>
        </div>
      </header>

      <section className={`panel ${styles.creditPanel}`}>
        <p className="kicker">INTERNAL_BETA_ADMIN_CREDIT</p>
        <h2>اعتبار تست داخلی</h2>
        <p className="muted">شناسه کامل کاربر، مبلغ در کوچک‌ترین واحد پول و دلیل مشخص را وارد کنید. ارسال دوباره همین فرم با همان کلید، اعتبار دوم ایجاد نمی‌کند.</p>
        <form className={styles.creditForm} onSubmit={creditWallet}>
          <label>
            شناسه کاربر تست
            <input
              dir="ltr"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              required
              disabled={creditBusy || Boolean(creditResult)}
            />
          </label>
          <label>
            مبلغ در واحد کوچک پول
            <input
              dir="ltr"
              inputMode="numeric"
              pattern="[0-9]+"
              value={amountMinor}
              onChange={(event) => setAmountMinor(event.target.value)}
              placeholder="40000"
              required
              disabled={creditBusy || Boolean(creditResult)}
            />
          </label>
          <label>
            ارز
            <input
              dir="ltr"
              value={currencyCode}
              onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
              minLength={3}
              maxLength={3}
              required
              disabled={creditBusy || Boolean(creditResult)}
            />
          </label>
          <label className={styles.fullWidth}>
            دلیل اعتبار
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
              required
              disabled={creditBusy || Boolean(creditResult)}
            />
          </label>
          <label className={`${styles.fullWidth} ${styles.creditKey}`}>
            کلید idempotency این ارسال
            <input dir="ltr" value={creditKey} readOnly aria-readonly="true" />
          </label>
          <div className={`actions ${styles.creditActions}`}>
            <button type="submit" disabled={creditBusy || Boolean(creditResult) || !creditKey}>
              {creditBusy ? 'در حال ثبت…' : 'ثبت یک‌باره اعتبار'}
            </button>
            <button type="button" className="ghost" onClick={resetCreditForm} disabled={creditBusy}>فرم تازه</button>
          </div>
        </form>
        {creditError && <p className="error">ثبت نشد: {creditError}</p>}
        {creditResult && (
          <div className="safeNotice">
            اعتبار ثبت شد. تراکنش <span dir="ltr">{creditResult.transactionId}</span>، موجودی قابل استفاده {amount(creditResult.availableMinor, creditResult.currencyCode)}
            {creditResult.idempotent ? '؛ این پاسخ مربوط به ارسال تکراری همان عملیات بود.' : '.'}
          </div>
        )}
      </section>

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
                <span className="statusPill">{item.initializationAmbiguous ? 'INITIALIZATION AMBIGUOUS' : item.status}</span>
              </div>
              <div className="facts compact">
                <p><b>User:</b> {short(item.userId)}</p>
                <p><b>Provider:</b> {item.provider}</p>
                <p><b>Provider ref:</b> {item.providerReferencePresent ? 'ثبت شده' : 'ثبت نشده'}</p>
                <p><b>Fee:</b> {amount(item.providerFeeMinor, item.currencyCode)}</p>
              </div>
              {item.initializationAmbiguous && (
                <p className="error">توکن پرداخت قطعی ثبت نشده و وضعیت مبهم است. این attempt را دستی credit نکن و با همان idempotency key دوباره پرداخت جدید نساز.</p>
              )}
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
