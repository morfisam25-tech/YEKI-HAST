'use client';

import { useState } from 'react';

type CaseKindParam = 'reports' | 'events';

type RecordingMetadata = {
  id: string;
  state: string;
  startedAt: string | null;
  endedAt: string | null;
  retentionUntil: string | null;
  legalHold: boolean;
  legalHoldReasonCode: string | null;
  failureCode: string | null;
};

type PlaybackGrant = {
  grantId: string;
  recordingSessionId: string;
  authorizedAt: string;
  expiresAt: string;
  playbackUrl: string | null;
  playbackUrlNote: string | null;
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

function short(value: string | null): string {
  return value ? `${value.slice(0, 8)}…` : '—';
}

const stateLabels: Record<string, string> = {
  not_requested: 'درخواست نشده',
  consent_pending: 'در انتظار رضایت',
  ready: 'آماده',
  starting: 'در حال شروع',
  recording: 'در حال ضبط',
  stopping: 'در حال توقف',
  uploading: 'در حال آپلود',
  stored: 'ذخیره‌شده',
  failed: 'ناموفق',
  held: 'نگه‌داشته‌شده (Legal Hold)',
  purged: 'حذف‌شده (Purged)',
};

function toApiCaseKind(kind: CaseKindParam): 'report' | 'safety_event' {
  return kind === 'reports' ? 'report' : 'safety_event';
}

export default function RecordingsPage() {
  const [caseKind, setCaseKind] = useState<CaseKindParam>('reports');
  const [caseId, setCaseId] = useState('');
  const [callId, setCallId] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingMetadata | null>(null);
  const [grant, setGrant] = useState<PlaybackGrant | null>(null);
  const [looked, setLooked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function fetchRecording(): Promise<{ ok: true; callId: string; recording: RecordingMetadata | null }> {
    const id = caseId.trim();
    return api(`/api/ops/safety-cases/${caseKind}/${encodeURIComponent(id)}/recording`);
  }

  async function lookup() {
    if (!caseId.trim()) { setError('شناسه پرونده را وارد کنید.'); return; }
    setBusy(true);
    setError('');
    setGrant(null);
    try {
      const value = await fetchRecording();
      setCallId(value.callId);
      setRecording(value.recording);
      setLooked(true);
    } catch (cause) {
      setCallId(null);
      setRecording(null);
      setLooked(false);
      setError(cause instanceof Error ? cause.message : 'request_failed');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    try {
      const value = await fetchRecording();
      setCallId(value.callId);
      setRecording(value.recording);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'request_failed');
    }
  }

  function promptReasonCode(label: string): string | null {
    const entered = window.prompt(label, 'safety_investigation');
    if (entered === null) return null;
    const code = entered.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(code)) {
      setError('Reason code معتبر نیست.');
      return null;
    }
    return code;
  }

  async function requestPlayback() {
    if (!recording || busy) return;
    const reasonCode = promptReasonCode('دلیل درخواست دسترسی پخش (Reason code):');
    if (reasonCode === null) return;
    if (!window.confirm('این درخواست به‌طور کامل ممیزی (audit) می‌شود و کوتاه‌مدت است. ادامه می‌دهید؟')) return;
    setBusy(true);
    setError('');
    try {
      const value = await api<PlaybackGrant>(`/api/ops/recordings/${encodeURIComponent(recording.id)}/playback-grant`, {
        method: 'POST',
        body: JSON.stringify({ caseKind: toApiCaseKind(caseKind), caseId: caseId.trim(), reasonCode }),
      });
      setGrant(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'request_failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleHold(action: 'hold' | 'release') {
    if (!recording || busy) return;
    let reasonCode: string | undefined;
    if (action === 'hold') {
      const code = promptReasonCode('دلیل Legal Hold (Reason code):');
      if (code === null) return;
      reasonCode = code;
    }
    if (!window.confirm(action === 'hold' ? 'این ضبط برای Legal Hold نگه‌داشته شود؟' : 'Legal Hold این ضبط برداشته شود؟')) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'hold') {
        await api(`/api/ops/recordings/${encodeURIComponent(recording.id)}/hold`, {
          method: 'POST',
          body: JSON.stringify({ caseKind: toApiCaseKind(caseKind), caseId: caseId.trim(), reasonCode }),
        });
      } else {
        await api(`/api/ops/recordings/${encodeURIComponent(recording.id)}/hold/release`, { method: 'POST' });
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'request_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · RECORDINGS</p>
          <h1>شواهد و بازیابی ضبط تماس</h1>
          <p className="muted">
            این صفحه فقط برای بررسی شکایات توسط ادمین دارای مجوز recording_admin است. فقط متادیتای چرخه عمر ضبط
            نمایش داده می‌شود؛ هیچ لینک دانلود یا اشتراک‌گذاری عمومی وجود ندارد و هر درخواست دسترسی پخش به‌طور کامل ممیزی می‌شود.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="reviewRow wide">
          <select value={caseKind} onChange={(event) => setCaseKind(event.target.value as CaseKindParam)} aria-label="Safety case kind">
            <option value="reports">گزارش کاربر (Report)</option>
            <option value="events">رخداد ایمنی (Safety Event)</option>
          </select>
          <input
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
            placeholder="شناسه پرونده (Case ID)"
            aria-label="Case ID"
          />
          <button disabled={busy} onClick={() => lookup()}>جست‌وجوی ضبط</button>
        </div>
        {error && <p className="error">{error}</p>}

        {looked && (
          <article className="subPanel">
            <div className="sectionHeader">
              <div><p className="kicker">CALL</p><h3>{short(callId)}</h3></div>
              {recording && <span className="statusPill">{stateLabels[recording.state] ?? recording.state}</span>}
            </div>

            {!recording && <p className="muted">برای این تماس ضبطی ثبت نشده است.</p>}

            {recording && (
              <>
                <div className="facts compact">
                  <p><b>Recording ID:</b> {short(recording.id)}</p>
                  <p><b>شروع:</b> {recording.startedAt ? new Date(recording.startedAt).toLocaleString('fa-IR') : '—'}</p>
                  <p><b>پایان:</b> {recording.endedAt ? new Date(recording.endedAt).toLocaleString('fa-IR') : '—'}</p>
                  <p><b>نگهداری تا:</b> {recording.retentionUntil ? new Date(recording.retentionUntil).toLocaleString('fa-IR') : '—'}</p>
                  <p><b>Legal Hold:</b> {recording.legalHold ? `بله (${recording.legalHoldReasonCode ?? '—'})` : 'خیر'}</p>
                  {recording.failureCode && <p><b>خطا:</b> {recording.failureCode}</p>}
                </div>

                <div className="actions" style={{ marginTop: 14 }}>
                  <button className="ghost" disabled={busy} onClick={() => requestPlayback()}>درخواست دسترسی پخش</button>
                  {!recording.legalHold
                    ? <button className="danger" disabled={busy} onClick={() => toggleHold('hold')}>اعمال Legal Hold</button>
                    : <button className="ghost" disabled={busy} onClick={() => toggleHold('release')}>رفع Legal Hold</button>}
                </div>

                {grant && (
                  <div className="safeNotice" style={{ marginTop: 14 }}>
                    <p><b>مجوز پخش صادر شد.</b> این دسترسی ممیزی شده است و کوتاه‌مدت است.</p>
                    <p className="muted">Grant: {short(grant.grantId)} · انقضا: {new Date(grant.expiresAt).toLocaleString('fa-IR')}</p>
                    <p className="muted">{grant.playbackUrl ?? grant.playbackUrlNote ?? 'پخش هنوز از طریق این مسیر در دسترس نیست.'}</p>
                  </div>
                )}
              </>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
