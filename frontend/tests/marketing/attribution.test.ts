import { beforeEach, describe, expect, it } from 'vitest';

import {
  captureAttribution,
  clearAttribution,
  getPersistedAttribution,
  parseAttribution,
} from '@/lib/attribution';

describe('parseAttribution', () => {
  it('extracts utm parameters from a URL', () => {
    expect(
      parseAttribution(
        'https://app.example.com/share/abc?utm_source=kakao&utm_medium=social&utm_campaign=spring_launch',
      ),
    ).toEqual({
      utm_source: 'kakao',
      utm_medium: 'social',
      utm_campaign: 'spring_launch',
    });
  });

  it('extracts a referral code from a URL', () => {
    expect(
      parseAttribution('https://app.example.com/share/abc?referral_code=friend01'),
    ).toEqual({
      referral_code: 'friend01',
    });
  });

  it('gracefully handles missing or empty utm parameters', () => {
    expect(
      parseAttribution(
        'https://app.example.com/share/abc?utm_source=&utm_medium=   &utm_campaign=',
      ),
    ).toEqual({});
  });
});

describe('attribution persistence', () => {
  beforeEach(() => {
    clearAttribution();
    window.history.replaceState({}, '', '/');
  });

  it('captures attribution from the landing URL and persists it in sessionStorage', () => {
    window.history.replaceState(
      {},
      '',
      '/?utm_source=kakao&utm_medium=share&utm_campaign=spring2026&referral_code=abc123',
    );

    expect(captureAttribution()).toEqual({
      utm_source: 'kakao',
      utm_medium: 'share',
      utm_campaign: 'spring2026',
      referral_code: 'abc123',
    });
    expect(sessionStorage.getItem('marketing_attribution')).toBe(
      JSON.stringify({
        utm_source: 'kakao',
        utm_medium: 'share',
        utm_campaign: 'spring2026',
        referral_code: 'abc123',
      }),
    );
  });

  it('reads stored attribution from sessionStorage', () => {
    sessionStorage.setItem(
      'marketing_attribution',
      JSON.stringify({
        utm_source: 'naver',
        utm_medium: 'blog',
        utm_campaign: 'april2026',
        referral_code: 'friend42',
      }),
    );

    expect(getPersistedAttribution()).toEqual({
      utm_source: 'naver',
      utm_medium: 'blog',
      utm_campaign: 'april2026',
      referral_code: 'friend42',
    });
  });

  it('clears persisted attribution', () => {
    sessionStorage.setItem(
      'marketing_attribution',
      JSON.stringify({ utm_source: 'kakao' }),
    );

    clearAttribution();

    expect(sessionStorage.getItem('marketing_attribution')).toBeNull();
    expect(getPersistedAttribution()).toEqual({});
  });

  it('does not overwrite an already captured attribution payload', () => {
    window.history.replaceState({}, '', '/?utm_source=kakao&utm_medium=share');
    captureAttribution();

    window.history.replaceState({}, '', '/?utm_source=naver&utm_medium=search');

    expect(captureAttribution()).toEqual({
      utm_source: 'kakao',
      utm_medium: 'share',
    });
    expect(getPersistedAttribution()).toEqual({
      utm_source: 'kakao',
      utm_medium: 'share',
    });
  });
});
