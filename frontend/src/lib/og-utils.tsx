import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ReactElement } from 'react';
import { publicSiteUrl } from '@/lib/publicConfig';

export const OG_SIZE = { width: 1200, height: 630 };

let fontCache: ArrayBuffer | null = null;

/**
 * 로컬 Noto Sans KR TTF 폰트를 로딩합니다.
 * Satori(ImageResponse 렌더러)는 woff2를 지원하지 않으므로 TTF 필수.
 */
export async function loadKoreanFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;

  const data = await readFile(
    join(process.cwd(), 'assets/fonts/NotoSansKR-Bold.woff'),
  );
  fontCache = data.buffer as ArrayBuffer;
  return fontCache;
}

export function OGLayout({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}): ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 80px',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #7c3aed 100%)',
        fontFamily: 'NotoSansKR',
        position: 'relative',
      }}
    >
      {badge && (
        <div
          style={{
            fontSize: 22,
            color: '#c4b5fd',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {badge}
        </div>
      )}
      <div
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: 'white',
          lineHeight: 1.3,
          marginBottom: subtitle ? 20 : 0,
          wordBreak: 'keep-all',
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 26,
            color: '#a78bfa',
            lineHeight: 1.5,
            wordBreak: 'keep-all',
          }}
        >
          {subtitle}
        </div>
      )}
      {/* 하단 브랜드 바 */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: 80,
          right: 80,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 18, color: '#8b5cf6' }}>{new URL(publicSiteUrl).host}</div>
        <div
          style={{
            width: 60,
            height: 4,
            background: '#8b5cf6',
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

export function getFontConfig(fontData: ArrayBuffer) {
  return {
    fonts: [
      {
        name: 'NotoSansKR',
        data: fontData,
        style: 'normal' as const,
        weight: 700 as const,
      },
    ],
  };
}
