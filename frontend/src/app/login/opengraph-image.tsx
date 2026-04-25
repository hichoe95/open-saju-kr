import { ImageResponse } from 'next/og';
import { OG_SIZE, OGLayout, loadKoreanFont, getFontConfig } from '@/lib/og-utils';

export const alt = '로그인 | 사주 리포트';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const fontData = await loadKoreanFont();

  return new ImageResponse(
    (
      <OGLayout
        badge="로그인"
        title="나만의 사주를 확인해보세요"
        subtitle="카카오 / 네이버로 간편 로그인"
      />
    ),
    { ...size, ...getFontConfig(fontData) },
  );
}
