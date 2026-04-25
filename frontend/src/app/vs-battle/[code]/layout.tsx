import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '사주 배틀',
  robots: { index: false, follow: false },
};

export default function VsBattleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
