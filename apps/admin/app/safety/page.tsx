'use client';

import { useEffect, useState } from 'react';

type ReportCase = {
  id: string;
  callId: string | null;
  reporterUserId: string;
  reportedUserId: string | null;
  category: string;
  severity: string;
  status: string;
  assignedAdminUserId: string | null;
  resolutionCode: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  privateDetailsIncluded: false;
};

type SafetyEvent = {
  id: string;
  callId: string;
  triggeredBy: string;
  triggerUserId: string | null;
  severity: string;
  status: string;
  actionCode: string | null;
  assignedAdminUserId: string | null;
  resolutionCode: string | null;
  triggeredAt: string;
  resolvedAt: string | null;
  updatedAt: string;
  privateDetailsIncluded: false;
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

export default function SafetyPage() {
  const [reports, setReports] = useState<ReportCase[]>([]);
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  const [status, setStatus] = useState('open');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    const value = await api<{ reports: ReportCase[]; safetyEvents: SafetyEvent[] }>(`/api/ops/safety-cases${qs}`);
    setReports(value.reports);
    setEvents(value.safetyEvents);
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, [status]);

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · SAFETY</p>
          <h1>عملیات ایمنی و گزارش‌ها</h1>
          <p className="muted">این صف فقط متادیتای عملیاتی را نشان می‌دهد؛ متن خصوصی گزارش‌ها عمداً در این نمای لیستی رمزگشایی نمی‌شود.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => { window.location.href = '/'; }}>داشبورد</button>
          <button className="ghost" onClick={() => load()}>به‌روزرسانی</button>
        </div>
      </header>

      <section className="panel">
        <div className="reviewRow wide">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Safety case status filter">
            <option value="open">باز</option>
            <option value="in_review">در حال بررسی</option>
            <option value="resolved">حل‌شده</option>
            <option value="dismissed">مختومه بدون اقدام</option>
            <option value="">همه وضعیت‌ها</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}

        <div className="sectionHeader">
          <div>
            <p className="kicker">REPORTS</p>
            <h2>گزارش‌های کاربران</h2>
          </div>
          <span className="statusPill">{reports.length.toLocaleString('fa-IR')}</span>
        </div>
        <div className="queue">
          {reports.map((item) => (
            <article key={item.id} className="subPanel">
              <div className="sectionHeader">
                <div>
                  <p className="kicker">{short(item.id)}</p>
                  <h3>{item.category}</h3>
                </div>
                <span className="statusPill">{item.severity} · {item.status}</span>
              </div>
              <div className="facts compact">
                <p><b>Call:</b> {short(item.callId)}</p>
                <p><b>Reporter:</b> {short(item.reporterUserId)}</p>
                <p><b>Reported:</b> {short(item.reportedUserId)}</p>
                <p><b>Assigned:</b> {short(item.assignedAdminUserId)}</p>
              </div>
              <p className="muted">ایجاد: {new Date(item.createdAt).toLocaleString('fa-IR')}</p>
            </article>
          ))}
          {!reports.length && <p className="muted">گزارشی در این وضعیت وجود ندارد.</p>}
        </div>

        <div className="sectionHeader" style={{ marginTop: 24 }}>
          <div>
            <p className="kicker">SAFETY EVENTS</p>
            <h2>خروج‌های ایمنی و رخدادها</h2>
          </div>
          <span className="statusPill">{events.length.toLocaleString('fa-IR')}</span>
        </div>
        <div className="queue">
          {events.map((item) => (
            <article key={item.id} className="subPanel">
              <div className="sectionHeader">
                <div>
                  <p className="kicker">{short(item.id)}</p>
                  <h3>{item.actionCode ?? 'safety_event'}</h3>
                </div>
                <span className="statusPill">{item.severity} · {item.status}</span>
              </div>
              <div className="facts compact">
                <p><b>Call:</b> {short(item.callId)}</p>
                <p><b>Triggered by:</b> {item.triggeredBy}</p>
                <p><b>User ref:</b> {short(item.triggerUserId)}</p>
                <p><b>Assigned:</b> {short(item.assignedAdminUserId)}</p>
              </div>
              <p className="muted">زمان رخداد: {new Date(item.triggeredAt).toLocaleString('fa-IR')}</p>
            </article>
          ))}
          {!events.length && <p className="muted">رخداد ایمنی در این وضعیت وجود ندارد.</p>}
        </div>
      </section>
    </main>
  );
}
