'use client';

import { useEffect, useState } from 'react';

type Feedback = {
  callId: string;
  listenerId: string;
  rating: number | null;
  favorite: boolean;
};

type Props = {
  callId: string;
  listenerNickname?: string;
  className?: string;
};

export default function PostCallFeedback({ callId, listenerNickname = 'این شنونده', className }: Props) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void fetch(`/api/caller/calls/${encodeURIComponent(callId)}/feedback`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (Feedback & { error?: string }) | null;
        if (!response.ok || !payload) throw new Error(payload?.error || `http_${response.status}`);
        if (active) setFeedback(payload);
      })
      .catch((cause) => {
        if (!active) return;
        const code = cause instanceof Error ? cause.message : 'feedback_load_failed';
        if (code !== 'call_not_rateable') setError('بازخورد این گفت‌وگو فعلاً در دسترس نیست.');
      });
    return () => { active = false; };
  }, [callId]);

  async function save(patch: { rating?: number; favorite?: boolean }) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/caller/calls/${encodeURIComponent(callId)}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => null) as (Feedback & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error || `http_${response.status}`);
      setFeedback(payload);
      setNotice(patch.rating !== undefined ? 'امتیازت ثبت شد.' : payload.favorite ? 'به علاقه‌مندی‌ها اضافه شد.' : 'از علاقه‌مندی‌ها برداشته شد.');
    } catch {
      setError('ثبت بازخورد انجام نشد. دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }

  if (!feedback && !error) return <div className={className} role="status">در حال آماده‌کردن بازخورد…</div>;
  if (!feedback) return null;

  return (
    <section className={className} aria-label="بازخورد بعد از گفت‌وگو">
      <div>
        <strong>این گفت‌وگو چطور بود؟</strong>
        <p>امتیاز و علاقه‌مندی جدا از گزارش ایمنی ثبت می‌شوند.</p>
      </div>
      <div role="group" aria-label="امتیاز به گفت‌وگو">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-pressed={feedback.rating === value}
            onClick={() => void save({ rating: value })}
          >
            {value.toLocaleString('fa-IR')}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-pressed={feedback.favorite}
        onClick={() => void save({ favorite: !feedback.favorite })}
      >
        {feedback.favorite ? `${listenerNickname} در علاقه‌مندی‌هاست` : `افزودن ${listenerNickname} به علاقه‌مندی‌ها`}
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status" aria-live="polite">{notice}</p>}
    </section>
  );
}
