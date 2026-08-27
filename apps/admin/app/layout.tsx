import type { CSSProperties, ReactNode } from 'react';
import './styles.css';

const navStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  padding: '10px 18px',
  background: 'rgba(8, 12, 18, 0.96)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
};

const linkStyle: CSSProperties = {
  color: 'inherit',
  textDecoration: 'none',
  padding: '7px 10px',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.10)',
  fontSize: '13px',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <nav style={navStyle} aria-label="Admin operations navigation">
          <a style={linkStyle} href="/">داشبورد</a>
          <a style={linkStyle} href="/calls">تماس‌ها</a>
          <a style={linkStyle} href="/safety">ایمنی</a>
          <a style={linkStyle} href="/payouts">پرداخت‌ها</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
