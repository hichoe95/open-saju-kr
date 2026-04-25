import type { Metadata } from 'next';
import { publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: Metadata = {
  title: '로그인',
  description: '카카오 또는 네이버로 간편하게 로그인하고 나만의 AI 사주 해석을 저장하세요. 10초 만에 시작할 수 있습니다.',
  alternates: {
    canonical: `${siteUrl}/login`,
  },
  openGraph: {
    title: '로그인 | 사주 리포트',
    description: '카카오 또는 네이버로 간편하게 로그인하고 나만의 AI 사주 해석을 저장하세요.',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
