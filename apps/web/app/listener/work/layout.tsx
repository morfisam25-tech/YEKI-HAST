import type { ReactNode } from 'react';
import ListenerReportParity from './ListenerReportParity';

export default function ListenerWorkLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ListenerReportParity />
    </>
  );
}
