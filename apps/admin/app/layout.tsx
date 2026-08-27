import type { ReactNode } from 'react';
import './styles.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <nav className="adminNav" aria-label="Admin operations navigation">
          <a href="/">داشبورد</a>
          <a href="/calls">تماس‌ها</a>
          <a href="/safety">ایمنی</a>
          <a href="/payouts">پرداخت‌ها</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
