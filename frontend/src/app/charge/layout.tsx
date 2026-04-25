import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '엽전 충전',
  description: '사주 리포트 엽전 충전. 안전한 토스페이먼츠 결제로 엽전을 충전하세요.',
  robots: { index: false, follow: false },
};

export default function ChargeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
