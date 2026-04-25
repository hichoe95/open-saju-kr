'use client';

import React, { forwardRef } from 'react';
import { toPng } from 'html-to-image';
import { SajuCharacter } from '@/types';
import { publicSiteUrl } from '@/lib/publicConfig';

// 오행별 그라데이션 (하드코딩 필수 — CSS Variables 사용 금지!)
const ELEMENT_GRADIENTS: Record<string, { background: string; color: string }> = {
  '목': { background: 'linear-gradient(135deg, #16a34a 0%, #4ade80 100%)', color: '#ffffff' },
  '화': { background: 'linear-gradient(135deg, #dc2626 0%, #f87171 100%)', color: '#ffffff' },
  '토': { background: 'linear-gradient(135deg, #92400e 0%, #d97706 100%)', color: '#ffffff' },
  '금': { background: 'linear-gradient(135deg, #78716c 0%, #d4af37 100%)', color: '#ffffff' },
  '수': { background: 'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 100%)', color: '#ffffff' },
};
const DEFAULT_GRADIENT = { background: 'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 100%)', color: '#ffffff' };

interface CharacterShareCardProps {
  character: SajuCharacter;
  hashtags?: string[];
  siteUrl?: string;
}

// forwardRef — 부모에서 ref.current에 toPng() 적용
const CharacterShareCard = forwardRef<HTMLDivElement, CharacterShareCardProps>(
  ({ character, hashtags, siteUrl = new URL(publicSiteUrl).host }, ref) => {
    const gradient = ELEMENT_GRADIENTS[character.element] ?? DEFAULT_GRADIENT;

    return (
      <div
        ref={ref}
        style={{
          position: 'absolute',
          left: -9999,
          top: 0,
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: gradient.background,
          color: gradient.color,
          fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
          padding: '80px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ lineHeight: 1, marginBottom: 40 }}>
          <img
            src={character.icon_path || '/icons/emoji-replacements/misc/sparkle.png'}
            width={160}
            height={160}
            alt=""
            loading="eager"
            style={{ objectFit: 'contain' }}
          />
        </div>
        {/* 유형명 */}
        <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 16, opacity: 0.9 }}>{character.type}</div>
        {/* 이름 */}
        <h2 style={{ fontSize: 64, fontWeight: 800, margin: '0 0 24px', textAlign: 'center' }}>{character.name}</h2>
        {/* 오행 배지 */}
        <div style={{
          background: 'rgba(255,255,255,0.25)',
          borderRadius: 40,
          padding: '10px 32px',
          fontSize: 28,
          fontWeight: 600,
          marginBottom: 40,
        }}>
          {character.element}의 기운
        </div>
        {/* 설명 */}
        <p style={{
          fontSize: 28,
          textAlign: 'center',
          lineHeight: 1.6,
          opacity: 0.9,
          maxWidth: 760,
          marginBottom: 60,
        }}>{character.description}</p>
        {/* 해시태그 */}
        {hashtags && hashtags.length > 0 && (
          <div style={{ fontSize: 24, opacity: 0.8, marginBottom: 40 }}>
            {hashtags.map(tag => `#${tag}`).join(' ')}
          </div>
        )}
        {/* 사이트 URL */}
        <div style={{ fontSize: 24, opacity: 0.6, marginTop: 'auto' }}>{siteUrl}</div>
      </div>
    );
  }
);
CharacterShareCard.displayName = 'CharacterShareCard';

export { CharacterShareCard };

// 이미지 내보내기 유틸
export async function exportCharacterCard(
  ref: React.RefObject<HTMLDivElement | null>,
  mode: 'share' | 'download' = 'share'
): Promise<void> {
  if (!ref.current) return;
  try {
    await document.fonts.ready; // 한글 폰트 깨짐 방지
    const images = Array.from(ref.current.querySelectorAll('img'));
    await Promise.all(images.map(async (img) => {
      if (img.complete) return;
      if (typeof img.decode === 'function') {
        try {
          await img.decode();
          return;
        } catch {}
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener('load', done);
          img.removeEventListener('error', done);
          resolve();
        };
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }));
    const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });

    // Web Share API — share 모드일 때만
    if (mode === 'share' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'saju-character.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '나의 사주 캐릭터',
          text: '나의 사주 캐릭터를 확인해보세요!',
        });
        return;
      }
    }

    // 폴백: 다운로드
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'saju-character.png';
    link.click();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    throw new Error(`캐릭터 카드 내보내기 실패: ${msg}`);
  }
}
