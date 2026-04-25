import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isKakaoAvailable, shareWithFallback } from '@/lib/kakaoShare';
import { buildShareUrl } from '@/lib/shareMetadata';

describe('kakao share helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'Kakao', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns false when the Kakao SDK is unavailable', () => {
    expect(isKakaoAvailable()).toBe(false);
  });

  it('falls back to clipboard when Kakao share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });

    const shareUrl = 'https://app.example.com/share/abc123?utm_source=kakao&utm_medium=share';
    const result = await shareWithFallback({
      title: 'AI 사주 분석 결과',
      description: '친구가 보낸 사주 결과를 확인해 보세요.',
      imageUrl: 'https://app.example.com/apple-icon.png',
      shareUrl,
    });

    expect(result).toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith(shareUrl);
  });

  it('builds attributed Kakao share links', () => {
    const shareUrl = buildShareUrl('abc123', 'saju', {
      utm_source: 'kakao',
      utm_medium: 'share',
    });

    const parsedUrl = new URL(shareUrl);
    expect(parsedUrl.pathname).toBe('/share/abc123');
    expect(parsedUrl.searchParams.get('utm_source')).toBe('kakao');
    expect(parsedUrl.searchParams.get('utm_medium')).toBe('share');
  });
});
