import type { ReactNode } from 'react';
import PwaRegister from './PwaRegister';
import './styles.css';

export const metadata = {
  title: 'یکی هست',
  description: 'یک آدم واقعی برای وقتی که فقط می‌خواهی حرف بزنی.',
  manifest: '/manifest.webmanifest',
  themeColor: '#1e1a17',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
