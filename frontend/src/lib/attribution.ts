import { publicSiteUrl } from '@/lib/publicConfig';

export interface AttributionParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referral_code?: string;
}

const DEFAULT_BASE_URL = publicSiteUrl;
const ATTRIBUTION_STORAGE_KEY = 'marketing_attribution';
const ATTRIBUTION_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'referral_code',
] as const satisfies ReadonlyArray<keyof AttributionParams>;

function getUrlParserBase(): string {
  if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }

  return DEFAULT_BASE_URL;
}

function normalizeParam(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeAttribution(value: unknown): AttributionParams {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const attribution: AttributionParams = {};

  for (const field of ATTRIBUTION_FIELDS) {
    const rawValue = (value as Record<string, unknown>)[field];

    if (typeof rawValue !== 'string') {
      continue;
    }

    const normalizedValue = normalizeParam(rawValue);
    if (normalizedValue) {
      attribution[field] = normalizedValue;
    }
  }

  return attribution;
}

export function parseAttribution(url: string): AttributionParams {
  const parsedUrl = new URL(url, getUrlParserBase());
  const params = parsedUrl.searchParams;

  return {
    ...(normalizeParam(params.get('utm_source'))
      ? { utm_source: normalizeParam(params.get('utm_source')) }
      : {}),
    ...(normalizeParam(params.get('utm_medium'))
      ? { utm_medium: normalizeParam(params.get('utm_medium')) }
      : {}),
    ...(normalizeParam(params.get('utm_campaign'))
      ? { utm_campaign: normalizeParam(params.get('utm_campaign')) }
      : {}),
    ...(normalizeParam(params.get('referral_code'))
      ? { referral_code: normalizeParam(params.get('referral_code')) }
      : {}),
  };
}

export function captureAttribution(): AttributionParams {
  if (typeof window === 'undefined') {
    return {};
  }

  if (sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) !== null) {
    return getPersistedAttribution();
  }

  const attribution = parseAttribution(window.location.href);
  sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));

  return attribution;
}

export function getPersistedAttribution(): AttributionParams {
  if (typeof window === 'undefined') {
    return {};
  }

  const storedValue = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
  if (!storedValue) {
    return {};
  }

  try {
    return sanitizeAttribution(JSON.parse(storedValue));
  } catch {
    return {};
  }
}

export function clearAttribution(): void {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
}
