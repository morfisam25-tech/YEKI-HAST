import type { ReactNode } from 'react';
import './styles.css';

export const metadata = {
  title: 'یکی هست',
  description: 'یک آدم واقعی برای وقتی که فقط می‌خواهی حرف بزنی.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
