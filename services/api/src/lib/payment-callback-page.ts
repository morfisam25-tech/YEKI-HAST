import type { ServerResponse } from 'node:http';

type CallbackStatus = 'pending' | 'cancelled' | 'failed' | 'succeeded';

const copy: Record<CallbackStatus, { title: string; body: string }> = {
  succeeded: {
    title: 'پرداخت تأیید شد',
    body: 'شارژ کیف پول با موفقیت ثبت شد. می‌توانی به اپ برگردی؛ موجودی به‌صورت خودکار به‌روزرسانی می‌شود.',
  },
  pending: {
    title: 'پرداخت در حال بررسی است',
    body: 'نتیجه هنوز قطعی نشده است. به اپ برگرد و وضعیت همین پرداخت را بررسی کن؛ پرداخت تازه‌ای نساز.',
  },
  cancelled: {
    title: 'پرداخت لغو شد',
    body: 'برای این پرداخت شارژی ثبت نشد. می‌توانی به اپ برگردی و در صورت نیاز دوباره اقدام کنی.',
  },
  failed: {
    title: 'پرداخت ناموفق بود',
    body: 'شارژی برای این پرداخت ثبت نشد. به اپ برگرد و وضعیت کیف پول را بررسی کن.',
  },
};

export function sendPaymentCallbackPage(res: ServerResponse, status: CallbackStatus): void {
  const message = copy[status];
  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${message.title} · یکی هست</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f5f3ee;color:#20211f;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(520px,100%);background:#fff;border:1px solid #e7e2da;border-radius:24px;padding:28px}.brand{font-size:14px;font-weight:800;opacity:.65;margin:0 0 28px}.title{font-size:26px;line-height:1.45;margin:0 0 12px}.body{font-size:16px;line-height:1.9;color:#66665f;margin:0}.note{font-size:13px;line-height:1.8;color:#84837c;margin:24px 0 0}
  </style>
</head>
<body>
  <main class="card">
    <p class="brand">یکی هست</p>
    <h1 class="title">${message.title}</h1>
    <p class="body">${message.body}</p>
    <p class="note">این صفحه هیچ اطلاعات پرداخت یا شناسه داخلی را نمایش نمی‌دهد.</p>
  </main>
</body>
</html>`;
  res.statusCode = status === 'pending' ? 202 : 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  res.end(html);
}
