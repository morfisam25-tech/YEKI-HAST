'use client';

import { useCallback, useEffect, useState } from 'react';
import ListenerReportPanel from '../../../components/listener/ReportPanel';
import styles from './report-parity.module.css';

type ActiveCall = { callId: string };
type RecentCall = {
  callId: string;
  endedAt: string | null;
  requestedAt: string;
  counterpartyActionAvailable: boolean;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api/listener/${path}`, { cache: 'no-store' });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error || `http_${response.status}`);
  return body;
}

export default function ListenerReportParity() {
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [active, recent] = await Promise.all([
        getJson<{ activeCall: ActiveCall | null }>('listener/calls/active'),
        getJson<{ calls: RecentCall[] }>('listener/calls/recent?limit=8'),
      ]);
      setActiveCallId(active.activeCall?.callId ?? null);
      setRecentCalls(recent.calls.filter((call) => call.counterpartyActionAvailable).slice(0, 3));
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!loaded || (!activeCallId && recentCalls.length === 0)) return null;

  return (
    <section className={styles.section} aria-labelledby="listener-report-title">
      <div className={styles.shell}>
        <div className={styles.headingRow}>
          <div>
            <p className={styles.kicker}>ایمنی و گزارش</p>
            <h2 id="listener-report-title">رفتار نامناسب را می‌توانی برای همان گفت‌وگو ثبت کنی.</h2>
            <p>گزارش به‌تنهایی تماس را پایان نمی‌دهد. اگر لازم است همان لحظه خارج شوی، از گزینه «خروج برای ایمنی و مسدودکردن» در گفت‌وگوی جاری استفاده کن.</p>
          </div>
          <button type="button" onClick={() => void refresh()}>تازه‌سازی</button>
        </div>

        {activeCallId && (
          <article className={styles.card}>
            <strong>گفت‌وگوی جاری</strong>
            <ListenerReportPanel callId={activeCallId} />
          </article>
        )}

        {recentCalls.length > 0 && (
          <div className={styles.recentGrid}>
            {recentCalls.map((call) => (
              <article className={styles.card} key={call.callId}>
                <strong>گفت‌وگوی پایان‌یافته · {new Date(call.endedAt ?? call.requestedAt).toLocaleString('fa-IR')}</strong>
                <ListenerReportPanel callId={call.callId} ended />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
