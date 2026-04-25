import { ImageResponse } from 'next/og';
import { OG_SIZE, OGLayout, loadKoreanFont, getFontConfig } from '@/lib/og-utils';

export const alt = '자주 묻는 질문 | 사주 리포트';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const fontData = await loadKoreanFont();

  return new ImageResponse(
    (
      <OGLayout
        badge="FAQ"
        title="자주 묻는 질문"
        subtitle="AI 사주 정확도, 요금, 개인정보 보호 등 9가지 궁금증 해결"
      />
    ),
    { ...size, ...getFontConfig(fontData) },
  );
}
