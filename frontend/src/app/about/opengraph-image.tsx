import { ImageResponse } from 'next/og';
import { OG_SIZE, OGLayout, loadKoreanFont, getFontConfig } from '@/lib/og-utils';

export const alt = 'AI 사주 서비스 소개 | 사주 리포트';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const fontData = await loadKoreanFont();

  return new ImageResponse(
    (
      <OGLayout
        badge="서비스 소개"
        title="전통 명리학과 AI의 만남"
        subtitle="한국천문연구원 데이터 기반 정밀 만세력 엔진"
      />
    ),
    { ...size, ...getFontConfig(fontData) },
  );
}
