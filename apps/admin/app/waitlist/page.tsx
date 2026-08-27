'use client';

import { useEffect, useState } from 'react';

type Entry = {
  id: string;
  userId: string;
  source: string | null;
  gender: string | null;
  preferredLanguageCode: string | null;
  createdAt: string;
  updatedAt: string;
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body as T;
}

function short(value: string): string {
  return `${value.slice(0, 8)}…`;
}

export default function WaitlistPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const value = await api<{ entries: Entry[] }>('/api/ops/caller-waitlist?limit=200');
    setEntries(value.entries);
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, []);

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · WAITLIST</p>
          <h1>صف انتظار تماس‌گیرنده‌ها</h1>
          <p className="muted">فقط متادیتای محصول نمایش داده می‌شود؛ شماره موبایل و جزئیات احراز سن در این صف وجود ندارد.</p>
        </div>
        <div className="actions"><button className="ghost" onClick={() => load()}>به‌روزرسانی</button></div>
      </header>

      <section className="panel">
        {error && <p className="error">{error}</p>}
        <div className="sectionHeader">
          <div><p className="kicker">CALLER DEMAND</p><h2>ورودی‌های صف</h2></div>
          <span className="statusPill">{entries.length.toLocaleString('fa-IR')}</span>
        </div>
        <div className="queue">
          {entries.map((item) => (
            <article key={item.id} className="subPanel">
              <div className="sectionHeader">
                <div><p className="kicker">{short(item.id)}</p><h3>{item.preferredLanguageCode ?? 'زبان نامشخص'}</h3></div>
                <span className="statusPill">{item.gender ?? 'gender: —'}</span>
              </div>
              <div className="facts compact">
                <p><b>User:</b> {short(item.userId)}</p>
                <p><b>Source:</b> {item.source ?? '—'}</p>
              </div>
              <p className="muted">ورود: {new Date(item.createdAt).toLocaleString('fa-IR')}</p>
            </article>
          ))}
          {!entries.length && <p className="muted">صف انتظار خالی است.</p>}
        </div>
      </section>
    </main>
  );
}
