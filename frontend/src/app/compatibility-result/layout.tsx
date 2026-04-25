import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '궁합 결과',
  robots: { index: false, follow: false },
};

export default function CompatibilityResultLayout({ children }: { children: React.ReactNode }) {
  return children;
}
