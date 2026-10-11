'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ToastHost } from './ui';

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const nobn = /\/(nuevo|editar)$/.test(pathname);
  return (
    <div className={nobn ? 'adm nobn' : 'adm'}>
      {children}
      <ToastHost />
    </div>
  );
}
