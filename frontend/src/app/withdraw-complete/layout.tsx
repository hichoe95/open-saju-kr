import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '탈퇴 완료',
  robots: { index: false, follow: false },
};

export default function WithdrawCompleteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
