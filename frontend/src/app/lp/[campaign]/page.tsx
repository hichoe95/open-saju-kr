import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCampaign } from '../campaigns';
import LandingPageClient from './LandingPageClient';

interface LandingPageProps {
  params: Promise<{ campaign: string }>;
}

export async function generateMetadata({
  params,
}: LandingPageProps): Promise<Metadata> {
  const { campaign } = await params;
  const config = getCampaign(campaign);

  if (!config) {
    return { title: 'Not Found' };
  }

  const { metadata } = config;

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: {
      canonical: metadata.canonical,
    },
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      url: metadata.canonical,
      type: 'website',
      images: metadata.ogImage ? [{ url: metadata.ogImage }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: metadata.title,
      description: metadata.description,
    },
  };
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { campaign } = await params;
  const config = getCampaign(campaign);

  if (!config) {
    notFound();
  }

  return <LandingPageClient config={config} />;
}
