import { ImageResponse } from 'next/og';
import { OG_SIZE, OGLayout, loadKoreanFont, getFontConfig } from '@/lib/og-utils';

export const alt = '사주 분석 활용 가이드 | 사주 리포트';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const fontData = await loadKoreanFont();

  return new ImageResponse(
    (
      <OGLayout
        badge="사용 가이드"
        title="사주 리포트 200% 활용하기"
        subtitle="사주 카드 읽기부터 AI 상담까지 5단계 가이드"
      />
    ),
    { ...size, ...getFontConfig(fontData) },
  );
}
