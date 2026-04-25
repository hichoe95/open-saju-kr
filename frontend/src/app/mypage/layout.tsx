import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '마이페이지',
  robots: { index: false, follow: false },
};

export default function MypageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
