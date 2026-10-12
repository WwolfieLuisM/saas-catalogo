import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminAuthProvider } from '@/hooks/useAdminAuth';
import { AdminShell } from '@/components/admin/AdminShell';
import '@/styles/admin.css';

export const metadata: Metadata = {
  title: { absolute: 'Luismi Platform · Admin V2' },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}
