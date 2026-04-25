import { describe, expect, it } from 'vitest';

import { buildOgMetadata, buildShareUrl } from '@/lib/shareMetadata';

describe('share metadata helpers', () => {
  it('constructs share URLs with attribution parameters', () => {
    const shareUrl = buildShareUrl('abc123', 'compatibility', {
      utm_source: 'kakao',
      utm_medium: 'share',
      utm_campaign: 'viral_push',
      referral_code: 'friend01',
    });

    const parsedUrl = new URL(shareUrl);
    expect(parsedUrl.pathname).toBe('/share/compatibility/abc123');
    expect(parsedUrl.searchParams.get('utm_source')).toBe('kakao');
    expect(parsedUrl.searchParams.get('utm_medium')).toBe('share');
    expect(parsedUrl.searchParams.get('utm_campaign')).toBe('viral_push');
    expect(parsedUrl.searchParams.get('referral_code')).toBe('friend01');
  });

  it('constructs Open Graph metadata objects for share cards', () => {
    expect(
      buildOgMetadata(
        '내 사주 공유 카드',
        '친구에게 내 사주 결과를 공유해 보세요.',
        'https://cdn.example.com/share/card.png',
      ),
    ).toEqual({
      title: '내 사주 공유 카드',
      description: '친구에게 내 사주 결과를 공유해 보세요.',
      openGraph: {
        title: '내 사주 공유 카드',
        description: '친구에게 내 사주 결과를 공유해 보세요.',
        images: [{ url: 'https://cdn.example.com/share/card.png' }],
      },
    });
  });
});
