import { ImageResponse } from 'next/og';
import { OG_SIZE, OGLayout, loadKoreanFont, getFontConfig } from '@/lib/og-utils';

export const alt = '무료 AI 사주 시작하기 | 사주 리포트';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const fontData = await loadKoreanFont();

  return new ImageResponse(
    (
      <OGLayout
        badge="사주 리포트"
        title="무료 AI 사주 시작하기"
        subtitle="생년월일만 입력하면 AI가 사주를 분석합니다"
      />
    ),
    { ...size, ...getFontConfig(fontData) },
  );
}
