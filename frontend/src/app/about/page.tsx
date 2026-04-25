import type { Metadata } from 'next';
import { Suspense } from 'react';
import styles from './page.module.css';
import AboutContent from './AboutContent';
import { publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: Metadata = {
  title: 'AI 사주 서비스 소개',
  description: '전통 명리학과 최신 AI를 결합해 사주팔자를 11가지 관점에서 분석합니다. 한국천문연구원 데이터 기반 정밀 만세력 엔진으로 정확한 사주 해석을 제공합니다.',
  alternates: {
    canonical: `${siteUrl}/about`,
  },
  openGraph: {
    title: 'AI 사주 서비스 소개 | 사주 리포트',
    description: '전통 명리학과 최신 AI를 결합해 사주팔자를 11가지 관점에서 분석합니다.',
    url: `${siteUrl}/about`,
    type: 'website',
  },
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: '서비스 소개', item: `${siteUrl}/about` },
  ],
};

export default function AboutPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
      <Suspense fallback={<div className={styles.loading}>로딩 중...</div>}>
        <AboutContent />
      </Suspense>
    </>
  );
}
