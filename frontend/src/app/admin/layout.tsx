import type { Metadata } from 'next';
import AdminShell from './AdminShell';

export const metadata: Metadata = {
  title: '관리자',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
