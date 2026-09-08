import type { ReactNode } from 'react';
import PwaRegister from './PwaRegister';
import './styles.css';

export const metadata = {
  title: 'یکی هست',
  description: 'فضایی برای شنیده‌شدن با احترام توسط یک شنونده انسانی.',
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
