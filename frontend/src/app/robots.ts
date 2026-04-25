import type { MetadataRoute } from 'next';
import { publicSiteUrl } from '@/lib/publicConfig';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = publicSiteUrl;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/mypage/',
          '/charge/',
          '/signup/',
          '/auth/',
          '/withdraw-complete/',
          '/review-login/',
          '/compatibility-result/',
          '/vs-battle/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
