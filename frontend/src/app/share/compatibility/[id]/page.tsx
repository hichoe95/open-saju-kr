import type { Metadata } from 'next';
import type { CompatibilityScenario } from '@/types';
import { buildOgMetadata } from '@/lib/shareMetadata';
import CompatibilitySharePageClient from './CompatibilitySharePageClient';
import { publicSiteUrl } from '@/lib/publicConfig';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003';
const SITE_URL = publicSiteUrl;
const DEFAULT_TITLE = 'AI 궁합 분석 결과';
const DEFAULT_DESCRIPTION = '두 사람의 AI 궁합 분석 결과를 확인해보세요';

const SCENARIO_TITLES: Record<CompatibilityScenario, string> = {
    lover: '연인 궁합',
    crush: '썸 궁합',
    friend: '친구 궁합',
    family: '가족 궁합',
    business: '비즈니스 궁합',
};

interface CompatibilityShareMetadataResponse {
    user_a?: { name?: string };
    user_b?: { name?: string };
    scenario?: CompatibilityScenario;
    compatibility_data?: {
        summary?: string;
        score?: number;
    };
}

function createCompatibilityMetadata(title: string, description: string): Metadata {
    const metadata = buildOgMetadata(title, description, `${SITE_URL}/logo.png`);

    return {
        ...metadata,
        openGraph: {
            ...metadata.openGraph,
            type: 'website',
        },
    };
}

function getCompatibilityTitle(data?: CompatibilityShareMetadataResponse): string {
    const userAName = data?.user_a?.name;
    const userBName = data?.user_b?.name;

    if (userAName && userBName) {
        return `${userAName}님과 ${userBName}님의 궁합 결과`;
    }

    return `${SCENARIO_TITLES[data?.scenario || 'lover']} 분석 결과`;
}

function getCompatibilityDescription(data?: CompatibilityShareMetadataResponse): string {
    if (data?.compatibility_data?.summary) {
        return data.compatibility_data.summary;
    }

    if (typeof data?.compatibility_data?.score === 'number') {
        return `${data.compatibility_data.score}점 궁합 결과를 확인해보세요`;
    }

    return DEFAULT_DESCRIPTION;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;

    try {
        const response = await fetch(`${API_BASE_URL}/api/share/compatibility/${id}`, {
            next: { revalidate: 3600 },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch compatibility share metadata');
        }

        const data = (await response.json()) as CompatibilityShareMetadataResponse;
        return createCompatibilityMetadata(getCompatibilityTitle(data), getCompatibilityDescription(data));
    } catch {
        return createCompatibilityMetadata(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
    }
}

export default async function CompatibilitySharePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return <CompatibilitySharePageClient shareCode={id} />;
}
