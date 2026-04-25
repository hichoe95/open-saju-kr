import type { ShareType } from '@/lib/analytics';
import type { AttributionParams } from '@/lib/attribution';
import { publicSiteUrl } from '@/lib/publicConfig';

const DEFAULT_SHARE_ORIGIN = publicSiteUrl;

export interface OgMetadata {
  title: string;
  description: string;
  openGraph: {
    title: string;
    description: string;
    images: Array<{ url: string }>;
  };
}

function resolveShareOrigin(): string {
  if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }

  return DEFAULT_SHARE_ORIGIN;
}

function resolveSharePath(shareId: string, type: ShareType): string {
  return type === 'compatibility'
    ? `/share/compatibility/${shareId}`
    : `/share/${shareId}`;
}

export function buildShareUrl(
  shareId: string,
  type: ShareType,
  attribution?: AttributionParams,
): string {
  const url = new URL(resolveSharePath(shareId, type), resolveShareOrigin());

  Object.entries(attribution ?? {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

export function buildOgMetadata(
  title: string,
  description: string,
  imageUrl?: string,
): OgMetadata {
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: imageUrl ? [{ url: imageUrl }] : [],
    },
  };
}
