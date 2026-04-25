const DEFAULT_API_BASE_URL = 'http://localhost:8003';
export const API_PROXY_BASE_URL = '/backend-proxy';

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isMySajuHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  const configuredSuffix = process.env.NEXT_PUBLIC_API_PROXY_SITE_HOST_SUFFIX?.trim().toLowerCase();
  if (!configuredSuffix) {
    return false;
  }

  return normalized === configuredSuffix || normalized.endsWith(`.${configuredSuffix}`);
}

function isRailwayHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized.endsWith('.railway.app') || normalized.endsWith('.up.railway.app');
}

export const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL;

export function shouldUseSameOriginApiProxy(rawApiBaseUrl: string = RAW_API_BASE_URL): boolean {
  if (typeof window === 'undefined' || !isAbsoluteHttpUrl(rawApiBaseUrl)) {
    return false;
  }

  const currentUrl = new URL(window.location.origin);
  const apiUrl = new URL(rawApiBaseUrl);

  if (currentUrl.origin === apiUrl.origin) {
    return false;
  }

  return isMySajuHostname(currentUrl.hostname) && isRailwayHostname(apiUrl.hostname);
}

export function getApiBaseUrl(rawApiBaseUrl: string = RAW_API_BASE_URL): string {
  if (shouldUseSameOriginApiProxy(rawApiBaseUrl)) {
    return API_PROXY_BASE_URL;
  }

  return rawApiBaseUrl;
}

export const API_BASE_URL = getApiBaseUrl();
