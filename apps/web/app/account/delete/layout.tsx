import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'حذف حساب | یکی هست',
  description: 'ثبت درخواست حذف حساب یکی هست پس از تأیید مالکیت ایمیل.',
};

export default function AccountDeletionLayout({ children }: { children: ReactNode }) {
  return children;
}
