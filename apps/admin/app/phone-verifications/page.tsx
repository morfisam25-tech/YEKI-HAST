'use client';

import { useEffect, useState } from 'react';

type PendingPhone = {
  userId: string;
  phone: string;
  email: string | null;
  submittedAt: string;
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

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    manual_phone_verification_disabled: 'تأیید دستی شماره برای این محیط خاموش است.',
    verification_confirmation_required: 'تأیید صریح مالکیت شماره لازم است.',
    call_phone_not_configured: 'این کاربر شماره‌ای برای تماس ثبت نکرده است.',
    unauthorized: 'نشست ادمین معتبر نیست.',
    admin_required: 'دسترسی ادمین لازم است.',
  };
  return messages[code] ?? code;
}

export default function PhoneVerificationsPage() {
  const [users, setUsers] = useState<PendingPhone[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setError('');
    const value = await api<{ users: PendingPhone[] }>('/api/ops/call-phone-verifications?limit=100');
    setUsers(value.users);
  }

  useEffect(() => {
    load().catch((cause) => setError(messageFor(cause instanceof Error ? cause.message : 'request_failed')));
  }, []);

  async function verify(item: PendingPhone) {
    if (busyUserId) return;
    const confirmed = window.confirm(
      `فقط اگر مالکیت این شماره را خارج از سیستم واقعاً بررسی کرده‌ای تأیید کن:\n\n${item.phone}\n${item.email ?? ''}`,
    );
    if (!confirmed) return;

    setBusyUserId(item.userId);
    setError('');
    setNotice('');
    try {
      await api(`/api/ops/users/${encodeURIComponent(item.userId)}/call-phone/verify`, {
        method: 'POST',
        body: JSON.stringify({ confirmed: true, note: 'verified from admin beta queue' }),
      });
      setUsers((current) => current.filter((user) => user.userId !== item.userId));
      setNotice('شماره تأیید شد و audit ثبت شد.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'request_failed'));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · CLOSED BETA</p>
          <h1>تأیید شماره تماس</h1>
          <p className="muted">
            این صفحه جای SMS OTP عمومی نیست. فقط در بتای بسته و بعد از بررسی واقعی مالکیت شماره خارج از سیستم از دکمه تأیید استفاده کن.
          </p>
        </div>
        <div className="actions"><button className="ghost" onClick={() => load()}>به‌روزرسانی</button></div>
      </header>

      <section className="panel">
        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
        <div className="sectionHeader">
          <div><p className="kicker">OUT-OF-BAND CHECK</p><h2>در انتظار بررسی</h2></div>
          <span className="statusPill">{users.length.toLocaleString('fa-IR')}</span>
        </div>
        <div className="queue">
          {users.map((item) => (
            <article key={item.userId} className="subPanel">
              <div className="sectionHeader">
                <div>
                  <p className="kicker">{item.userId.slice(0, 8)}…</p>
                  <h3 dir="ltr">{item.phone}</h3>
                </div>
                <span className="statusPill">pending</span>
              </div>
              <div className="facts compact">
                <p><b>Email:</b> <span dir="ltr">{item.email ?? '—'}</span></p>
                <p><b>ثبت:</b> {new Date(item.submittedAt).toLocaleString('fa-IR')}</p>
              </div>
              <p className="muted">قبل از تأیید باید مالکیت شماره را واقعاً با روش خارج از سیستم بررسی کرده باشی.</p>
              <div className="actions">
                <button
                  disabled={Boolean(busyUserId)}
                  onClick={() => verify(item)}
                >
                  {busyUserId === item.userId ? 'در حال ثبت…' : 'مالکیت بررسی شد — تأیید'}
                </button>
              </div>
            </article>
          ))}
          {!users.length && !error && <p className="muted">شماره‌ای در انتظار تأیید نیست.</p>}
        </div>
      </section>
    </main>
  );
}
