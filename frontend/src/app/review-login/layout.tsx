import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '리뷰 로그인',
  robots: { index: false, follow: false },
};

export default function ReviewLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
