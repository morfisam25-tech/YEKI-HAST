'use client';

import { useEffect, useState } from 'react';

type Integration = { provider?: string | null; ready: boolean };
type Readiness = {
  generatedAt: string;
  integrations: {
    sms: Integration;
    payment: Integration;
    payout: Integration;
    telephony: Integration;
    kycInquiry: Integration;
    callerAgePolicy: Integration;
  };
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body as T;
}

const labels: Array<[keyof Readiness['integrations'], string]> = [
  ['sms', 'OTP / SMS'],
  ['payment', 'شارژ کیف پول'],
  ['payout', 'تسویه شنونده'],
  ['telephony', 'اتصال تماس'],
  ['kycInquiry', 'استعلام KYC'],
  ['callerAgePolicy', 'سیاست سن Caller'],
];

export default function ReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setData(await api<Readiness>('/api/ops/integration-readiness'));
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, []);

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · READINESS</p>
          <h1>آمادگی اتصال‌های عملیاتی</h1>
          <p className="muted">این صفحه فقط آماده‌بودن تنظیمات را نشان می‌دهد و هیچ secret یا credential را نمایش نمی‌دهد.</p>
        </div>
        <div className="actions"><button className="ghost" onClick={() => load()}>به‌روزرسانی</button></div>
      </header>

      <section className="panel">
        {error && <p className="error">{error}</p>}
        {!data ? <p className="muted">در حال خواندن وضعیت…</p> : (
          <>
            <div className="grid">
              {labels.map(([key, label]) => {
                const item = data.integrations[key];
                return (
                  <article key={key}>
                    <small>{label}</small>
                    <strong>{item.ready ? 'READY' : 'BLOCKED'}</strong>
                    <p className="muted">{item.provider ?? 'بدون provider'}</p>
                  </article>
                );
              })}
            </div>
            <p className="muted">آخرین بررسی: {new Date(data.generatedAt).toLocaleString('fa-IR')}</p>
          </>
        )}
      </section>
    </main>
  );
}
