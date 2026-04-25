import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '회원가입',
  description: '사주 리포트 회원가입. 간편하게 가입하고 AI 사주 해석 서비스를 이용하세요.',
  robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
