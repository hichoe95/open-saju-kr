import type { Metadata } from 'next';
import { buildOgMetadata } from '@/lib/shareMetadata';
import SharePageClient from './SharePageClient';
import { publicSiteUrl } from '@/lib/publicConfig';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003';
const SITE_URL = publicSiteUrl;
const DEFAULT_TITLE = 'AI 사주 분석 결과';
const DEFAULT_DESCRIPTION = '사주팔자 AI 분석 결과를 확인해보세요';

interface ShareMetadataResponse {
    sharer_name?: string | null;
    reading_data?: {
        one_liner?: string;
        summary?: string;
        today_overview?: string;
    };
}

function createShareMetadata(title: string, description: string): Metadata {
    const metadata = buildOgMetadata(title, description, `${SITE_URL}/logo.png`);

    return {
        ...metadata,
        openGraph: {
            ...metadata.openGraph,
            type: 'website',
        },
    };
}

function getShareTitle(data?: ShareMetadataResponse): string {
    if (data?.sharer_name) {
        return `${data.sharer_name}님의 사주 결과`;
    }

    const overview = data?.reading_data?.one_liner || data?.reading_data?.summary || data?.reading_data?.today_overview;

    if (overview) {
        return `${overview.slice(0, 40)}${overview.length > 40 ? '...' : ''}`;
    }

    return DEFAULT_TITLE;
}

function getShareDescription(data?: ShareMetadataResponse): string {
    const overview = data?.reading_data?.one_liner || data?.reading_data?.summary || data?.reading_data?.today_overview;

    if (overview) {
        return overview;
    }

    return DEFAULT_DESCRIPTION;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;

    try {
        const response = await fetch(`${API_BASE_URL}/api/share/${id}`, {
            next: { revalidate: 3600 },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch share metadata');
        }

        const data = (await response.json()) as ShareMetadataResponse;
        return createShareMetadata(getShareTitle(data), getShareDescription(data));
    } catch {
        return createShareMetadata(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
    }
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return <SharePageClient shareCode={id} />;
}
