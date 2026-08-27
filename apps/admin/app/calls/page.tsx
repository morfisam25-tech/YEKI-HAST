'use client';

import { useEffect, useMemo, useState } from 'react';

type CallRow = {
  id: string;
  callerUserId: string;
  listenerUserId: string | null;
  status: string;
  requestedListenerGender: string;
  callerMood: string | null;
  topicCode: string | null;
  currencyCode: string;
  authorizedMinor: string;
  callerRatePerMinuteMinor: string;
  listenerRatePerMinuteMinor: string;
  telephonyProvider: string | null;
  recordingMode: string;
  requestedAt: string;
  connectedAt: string | null;
  billingStartedAt: string | null;
  endedAt: string | null;
  billableSeconds: number;
  callerChargeMinor: string;
  listenerEarningMinor: string;
  endedReason: string | null;
  updatedAt: string;
};

type CallAnomalies = {
  counts: {
    missingBridge: number;
    stalePreconnect: number;
    connectedOverrun: number;
    duplicateActiveCallers: number;
    duplicateActiveListeners: number;
    underReservedWallets: number;
    invariantViolations: number;
  };
  anomalies: {
    missingBridge: Array<{ callId: string; status: string; requestedAt: string; updatedAt: string }>;
    stalePreconnect: Array<{ callId: string; status: string; requestedAt: string; updatedAt: string }>;
    connectedOverrun: Array<{ callId: string; status: string; billingStartedAt: string; maxBillableSeconds: number; updatedAt: string }>;
    duplicateActiveCallers: Array<{ callerUserId: string; activeCallCount: number; callIds: string[] }>;
    duplicateActiveListeners: Array<{ listenerUserId: string; activeCallCount: number; callIds: string[] }>;
    underReservedWallets: Array<{ userId: string; currencyCode: string; reservedMinor: string; requiredReservedMinor: string; activeCallCount: number }>;
    invariantViolations: Array<{
      callId: string;
      status: string;
      issueCode: string;
      authorizedMinor: string;
      callerChargeMinor: string;
      listenerEarningMinor: string;
      chargeTransactionCount: number;
      chargeDeltaTotal: string;
      chargeSourceMismatchCount: number;
      earningRowCount: number;
      earningTotal: string;
      earningSourceMismatchCount: number;
      updatedAt: string;
    }>;
  };
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [anomalies, setAnomalies] = useState<CallAnomalies | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [recoveringCallId, setRecoveringCallId] = useState<string | null>(null);

  const recoverableCallIds = useMemo(() => new Set(
    anomalies?.anomalies.stalePreconnect
      .filter((item) => item.status === 'routing')
      .map((item) => item.callId) ?? [],
  ), [anomalies]);

  const invariantIssuesByCall = useMemo(() => new Map(
    anomalies?.anomalies.invariantViolations.map((item) => [item.callId, item.issueCode]) ?? [],
  ), [anomalies]);

  const duplicateActiveCallerCallIds = useMemo(() => new Set(
    anomalies?.anomalies.duplicateActiveCallers.flatMap((item) => item.callIds) ?? [],
  ), [anomalies]);

  const duplicateActiveListenerCallIds = useMemo(() => new Set(
    anomalies?.anomalies.duplicateActiveListeners.flatMap((item) => item.callIds) ?? [],
  ), [anomalies]);

  async function load() {
    setError('');
    const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    const [callsValue, anomalyValue] = await Promise.all([
      api<{ calls: CallRow[] }>(`/api/ops/calls${qs}`),
      api<CallAnomalies>('/api/ops/calls?anomalies=true'),
    ]);
    setCalls(callsValue.calls);
    setAnomalies(anomalyValue);
  }

  async function recoverStaleRouting(callId: string) {
    setRecoveringCallId(callId);
    setError('');
    try {
      await api(`/api/ops/calls/${encodeURIComponent(callId)}/recover-stale-routing`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'call_recovery_failed');
    } finally {
      setRecoveringCallId(null);
    }
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, [status]);

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · CALLS</p>
          <h1>عملیات تماس‌ها</h1>
          <p className="muted">این نما شماره تلفن و شناسه داخلی bridge مخابراتی را نمایش نمی‌دهد.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => { window.location.href = '/'; }}>داشبورد</button>
          <button className="ghost" onClick={() => load()}>به‌روزرسانی</button>
        </div>
      </header>

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <p className="kicker">CALL HEALTH</p>
            <h2>هشدارهای قطعی</h2>
          </div>
        </div>
        <div className="facts compact">
          <p><b>Bridge گمشده:</b> {anomalies?.counts.missingBridge ?? '—'}</p>
          <p><b>Pre-connect مانده:</b> {anomalies?.counts.stalePreconnect ?? '—'}</p>
          <p><b>Connected overrun:</b> {anomalies?.counts.connectedOverrun ?? '—'}</p>
          <p><b>Caller با چند تماس فعال:</b> {anomalies?.counts.duplicateActiveCallers ?? '—'}</p>
          <p><b>Listener با چند تماس فعال:</b> {anomalies?.counts.duplicateActiveListeners ?? '—'}</p>
          <p><b>Under-reserved wallet:</b> {anomalies?.counts.underReservedWallets ?? '—'}</p>
          <p><b>Terminal/financial invariant:</b> {anomalies?.counts.invariantViolations ?? '—'}</p>
        </div>
        {!!anomalies?.anomalies.duplicateActiveCallers.length && (
          <div className="queue">
            {anomalies.anomalies.duplicateActiveCallers.map((item) => (
              <div className="subPanel" key={item.callerUserId}>
                <p className="error">Caller {short(item.callerUserId)} همزمان {item.activeCallCount.toLocaleString('fa-IR')} تماس فعال دارد.</p>
                <p className="muted">Call IDs: {item.callIds.map((id) => short(id)).join(' · ')}</p>
              </div>
            ))}
          </div>
        )}
        {!!anomalies?.anomalies.duplicateActiveListeners.length && (
          <div className="queue">
            {anomalies.anomalies.duplicateActiveListeners.map((item) => (
              <div className="subPanel" key={item.listenerUserId}>
                <p className="error">Listener {short(item.listenerUserId)} همزمان {item.activeCallCount.toLocaleString('fa-IR')} تماس فعال دارد.</p>
                <p className="muted">Call IDs: {item.callIds.map((id) => short(id)).join(' · ')}</p>
              </div>
            ))}
          </div>
        )}
        <p className="muted">Recovery خودکار فقط برای routing قدیمی و بدون bridge/connection مجاز است. duplicate active call، هشدارهای مالی و terminal فقط برای بررسی هستند و هیچ اصلاح خودکار از این صفحه انجام نمی‌شود.</p>
      </section>

      <section className="panel">
        <div className="reviewRow wide">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Call status filter">
            <option value="">همه وضعیت‌ها</option>
            <option value="requested">requested</option>
            <option value="routing">routing</option>
            <option value="calling_caller">calling_caller</option>
            <option value="caller_answered">caller_answered</option>
            <option value="calling_listener">calling_listener</option>
            <option value="connected">connected</option>
            <option value="completed">completed</option>
            <option value="missed">missed</option>
            <option value="cancelled">cancelled</option>
            <option value="failed">failed</option>
            <option value="safety_terminated">safety_terminated</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="queue">
          {calls.map((call) => {
            const canRecover = call.status === 'routing' && recoverableCallIds.has(call.id);
            const invariantIssue = invariantIssuesByCall.get(call.id);
            const duplicateActiveCaller = duplicateActiveCallerCallIds.has(call.id);
            const duplicateActiveListener = duplicateActiveListenerCallIds.has(call.id);
            return (
              <article key={call.id} className="subPanel">
                <div className="sectionHeader">
                  <div>
                    <p className="kicker">{short(call.id)}</p>
                    <h3>{call.status}</h3>
                  </div>
                  <span className="statusPill">{call.billableSeconds.toLocaleString('fa-IR')} ثانیه</span>
                </div>
                <div className="facts compact">
                  <p><b>Caller:</b> {short(call.callerUserId)}</p>
                  <p><b>Listener:</b> {short(call.listenerUserId)}</p>
                  <p><b>Gender request:</b> {call.requestedListenerGender}</p>
                  <p><b>Mood:</b> {call.callerMood ?? '—'}</p>
                  <p><b>Topic:</b> {call.topicCode ?? '—'}</p>
                  <p><b>Telephony:</b> {call.telephonyProvider ?? '—'}</p>
                  <p><b>Caller charge:</b> {amount(call.callerChargeMinor, call.currencyCode)}</p>
                  <p><b>Listener earning:</b> {amount(call.listenerEarningMinor, call.currencyCode)}</p>
                </div>
                <p className="muted">درخواست: {new Date(call.requestedAt).toLocaleString('fa-IR')}</p>
                {call.endedReason && <p className="muted">پایان: {call.endedReason}</p>}
                {duplicateActiveCaller && <p className="error">Invariant: caller_has_multiple_active_calls</p>}
                {duplicateActiveListener && <p className="error">Invariant: listener_has_multiple_active_calls</p>}
                {invariantIssue && <p className="error">Invariant: {invariantIssue}</p>}
                {canRecover && (
                  <div className="actions">
                    <button
                      className="ghost"
                      disabled={recoveringCallId === call.id}
                      onClick={() => recoverStaleRouting(call.id)}
                    >
                      {recoveringCallId === call.id ? 'در حال Recovery…' : 'Recovery امن routing'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {!calls.length && <p className="muted">تماسی در این وضعیت وجود ندارد.</p>}
        </div>
      </section>
    </main>
  );
}
