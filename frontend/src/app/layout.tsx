import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { publicBusinessAddress, publicContactEmail, publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

const globalJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: '사주 리포트',
      url: siteUrl,
      description: 'AI가 전통 명리학으로 사주를 분석합니다. 연애운, 금전운, 대운, 궁합까지.',
      inLanguage: 'ko-KR',
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: '사주 리포트',
      url: siteUrl,
      description: '전통 명리학과 AI를 결합한 사주 해석 서비스',
      email: publicContactEmail,
      address: {
        '@type': 'PostalAddress',
        streetAddress: publicBusinessAddress,
        addressLocality: '',
        addressCountry: 'KR',
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#app`,
      name: '사주 리포트',
      url: siteUrl,
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'KRW',
        description: '무료 사주 분석 제공',
      },
      provider: { '@id': `${siteUrl}/#organization` },
    },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "AI 사주 분석 - 무료 사주풀이 & 운세 | 사주 리포트",
    template: "%s | 사주 리포트",
  },
  description: "AI가 전통 명리학으로 사주를 분석합니다. 연애운, 금전운, 대운, 궁합까지 생년월일만 입력하면 무료 확인. 지금 시작하세요.",
  keywords: [
    "사주", "AI 사주", "사주풀이", "무료 사주", "사주팔자",
    "운세", "명리학", "사주 분석", "AI 운세", "무료 운세",
    "연애운", "재물운", "커리어운", "대운 분석",
    "2026 운세", "궁합", "오행 분석", "GPT 사주",
    "사주 보기", "무료 사주풀이", "AI 명리학",
  ],
  authors: [{ name: "사주 리포트" }],
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "AI 사주 분석 - 무료 사주풀이 & 운세 | 사주 리포트",
    description: "AI가 전통 명리학으로 사주를 분석합니다. 연애운, 금전운, 대운, 궁합까지 생년월일만 입력하면 무료 확인.",
    url: siteUrl,
    siteName: '사주 리포트',
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI 사주 분석 - 무료 사주풀이 & 운세 | 사주 리포트",
    description: "AI가 전통 명리학으로 사주를 분석합니다. 연애운, 금전운, 대운, 궁합까지 생년월일만 입력하면 무료 확인.",
  },
  verification: {
    google: 'ov3VCPhuY4gPGsDwwYpMwO2dgUDeDFMqiNDQttfmJz0',
    other: { 'naver-site-verification': '028311399c0bf3dfcf7d3e81a236a0025f7f56b8' },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#8b5cf6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="사주포춘" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body>
        <script type="application/ld+json">{JSON.stringify(globalJsonLd)}</script>
        <a href="#main-content" style={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}>본문으로 건너뛰기</a>
        <div id="main-content">
          <Providers>{children}</Providers>
        </div>
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
