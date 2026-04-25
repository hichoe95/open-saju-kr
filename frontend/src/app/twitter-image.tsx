import { ImageResponse } from 'next/og';
import { OG_SIZE, OGLayout, loadKoreanFont, getFontConfig } from '@/lib/og-utils';

export const alt = 'AI 사주 분석 - 무료 사주풀이 & 운세 | 사주 리포트';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const fontData = await loadKoreanFont();

  return new ImageResponse(
    (
      <OGLayout
        badge="사주 리포트"
        title="AI가 해석하는 나만의 사주 카드"
        subtitle="전통 명리학 x 인공지능으로 연애운, 금전운, 대운 분석"
      />
    ),
    { ...size, ...getFontConfig(fontData) },
  );
}
