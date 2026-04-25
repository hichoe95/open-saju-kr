import type { Metadata } from 'next';
import { publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: Metadata = {
  title: '무료 AI 사주 시작하기',
  description: '생년월일만 입력하면 AI가 전통 명리학으로 사주를 분석합니다. 연애운, 금전운, 대운까지 지금 바로 무료로 확인해보세요.',
  alternates: {
    canonical: `${siteUrl}/onboarding`,
  },
  openGraph: {
    title: '무료 AI 사주 시작하기 | 사주 리포트',
    description: '생년월일만 입력하면 AI가 전통 명리학으로 사주를 분석합니다. 지금 바로 무료로 시작하세요.',
  },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
