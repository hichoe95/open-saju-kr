import type { MetadataRoute } from 'next';
import { getAllCampaignSlugs } from './lp/campaigns';
import { publicSiteUrl } from '@/lib/publicConfig';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = publicSiteUrl;

  const staticRoutes: {
    path: string;
    changeFrequency: 'daily' | 'weekly' | 'monthly';
    priority: number;
  }[] = [
    { path: '', changeFrequency: 'daily', priority: 1.0 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/faq', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/login', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/onboarding', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/terms', changeFrequency: 'monthly', priority: 0.3 },
    { path: '/privacy', changeFrequency: 'monthly', priority: 0.3 },
    { path: '/refund', changeFrequency: 'monthly', priority: 0.3 },
  ];

  const lpRoutes = getAllCampaignSlugs().map((slug) => ({
    path: `/lp/${slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }));

  return [...staticRoutes, ...lpRoutes].map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date('2026-04-06'),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
