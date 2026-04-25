import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '인증 처리 중',
  robots: { index: false, follow: false },
};

export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
