import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiBase', () => ({
  API_BASE_URL: 'http://localhost:8003',
}));

vi.mock('@/utils/authToken', () => ({
  buildClientAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

import {
  getSessionId,
  trackButtonClick,
  trackEvent,
  trackFeatureUsed,
  trackPageView,
  trackShareCreated,
  trackShareViewed,
} from '@/lib/analytics';
import {
  FEATURE_NAMES,
  SHARE_METHODS,
  SHARE_TYPES,
  TAB_NAMES,
} from '@/lib/analyticsContract';

function getRequestInit(callIndex = 0): RequestInit {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls[callIndex]?.[1] as RequestInit;
}

function getRequestBody(callIndex = 0): Record<string, unknown> {
  return JSON.parse(String(getRequestInit(callIndex).body));
}

describe('analytics helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: '',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the trackEvent payload shape', async () => {
    const result = await trackEvent(
      'page_view',
      { page: 'home', placement: 'hero' },
      'sess_123',
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8003/api/analytics/track/event',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    expect(getRequestBody()).toEqual({
      event_type: 'page_view',
      event_data: { page: 'home', placement: 'hero' },
      session_id: 'sess_123',
    });
  });

  it('merges persisted attribution into generic event payloads', async () => {
    sessionStorage.setItem(
      'marketing_attribution',
      JSON.stringify({
        utm_source: 'kakao',
        utm_medium: 'share',
        utm_campaign: 'spring2026',
        referral_code: 'abc123',
      }),
    );

    await trackEvent(
      'page_view',
      { page: 'home', utm_source: 'override-source' },
      'sess_123',
    );

    expect(getRequestBody()).toEqual({
      event_type: 'page_view',
      event_data: {
        utm_source: 'override-source',
        utm_medium: 'share',
        utm_campaign: 'spring2026',
        referral_code: 'abc123',
        page: 'home',
      },
      session_id: 'sess_123',
    });
  });

  it('builds the share created payload', async () => {
    await trackShareCreated('share_123', 'saju', 'sunrise', 'kakao');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8003/api/analytics/track/share',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    expect(getRequestBody()).toEqual({
      share_id: 'share_123',
      share_type: 'saju',
      card_theme: 'sunrise',
      share_method: 'kakao',
    });
  });

  it('adds persisted attribution to share payloads', async () => {
    sessionStorage.setItem(
      'marketing_attribution',
      JSON.stringify({
        utm_source: 'kakao',
        utm_medium: 'share',
        utm_campaign: 'spring2026',
        referral_code: 'abc123',
      }),
    );

    await trackShareCreated('share_123', 'saju', 'sunrise', 'kakao');

    expect(getRequestBody()).toEqual({
      share_id: 'share_123',
      share_type: 'saju',
      card_theme: 'sunrise',
      share_method: 'kakao',
      utm_source: 'kakao',
      utm_medium: 'share',
      utm_campaign: 'spring2026',
      referral_code: 'abc123',
    });
  });

  it('includes page, url, and referrer in page view payloads', async () => {
    window.history.replaceState({}, '', '/marketing?utm_source=kakao');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://search.example.com/',
    });

    await trackPageView('home', { source: 'hero' });

    const payload = getRequestBody();
    expect(payload.event_type).toBe('page_view');
    expect(payload.session_id).toBe(sessionStorage.getItem('analytics_session_id'));
    expect(payload.event_data).toEqual({
      utm_source: 'kakao',
      page: 'home',
      url: expect.stringContaining('/marketing?utm_source=kakao'),
      referrer: 'https://search.example.com/',
      source: 'hero',
    });
  });

  it('includes the button field in button click payloads', async () => {
    await trackButtonClick('share_cta', { page: 'result' });

    const payload = getRequestBody();
    expect(payload.event_type).toBe('button_click');
    expect(payload.event_data).toEqual({
      button: 'share_cta',
      page: 'result',
    });
  });

  it('merges persisted attribution into feature metadata payloads', async () => {
    sessionStorage.setItem(
      'marketing_attribution',
      JSON.stringify({ utm_source: 'kakao', utm_medium: 'share' }),
    );

    await trackFeatureUsed('share_created', { page: 'result' });

    expect(getRequestBody()).toEqual({
      feature_name: 'share_created',
      metadata: {
        utm_source: 'kakao',
        utm_medium: 'share',
        page: 'result',
      },
    });
  });

  it('appends persisted attribution to share view query params', async () => {
    sessionStorage.setItem(
      'marketing_attribution',
      JSON.stringify({ utm_source: 'kakao', referral_code: 'abc123' }),
    );

    await trackShareViewed('share_123', 'sess_123');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8003/api/analytics/track/share-viewed?share_id=share_123&utm_source=kakao&referral_code=abc123&session_id=sess_123',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns a stable session id within the same session', () => {
    const firstSessionId = getSessionId();
    const secondSessionId = getSessionId();

    expect(firstSessionId).toMatch(/^sess_/);
    expect(secondSessionId).toBe(firstSessionId);
    expect(sessionStorage.getItem('analytics_session_id')).toBe(firstSessionId);
  });

  it('keeps exported analytics contract values aligned', () => {
    expect(SHARE_TYPES).toEqual(['saju', 'compatibility']);
    expect(SHARE_METHODS).toEqual(['link', 'kakao', 'image', 'clipboard']);
    expect(FEATURE_NAMES).toEqual([
      'reading_start',
      'reading_complete',
      'compatibility_start',
      'compatibility_complete',
      'flow_calendar_view',
      'flow_ai_advice',
      'decision_qa',
      'share_modal_open',
      'share_created',
      'profile_save',
      'check_in',
    ]);
    expect(TAB_NAMES).toEqual([
      'overview',
      'personality',
      'career',
      'wealth',
      'relationship',
      'health',
      'yearly',
      'monthly',
      'advice',
      'advanced',
      'decision',
      'summary',
      'lucky',
      'love',
      'money',
      'study',
      'compatibility',
      'life',
      'daeun',
    ]);
  });
});
