/**
 * Seasonal Campaign Configuration
 * 시즌별 마케팅 캠페인 설정 - 코드 상수로 관리
 */

export interface CampaignConfig {
    id: string;
    title: string;
    subtitle: string;
    ctaText: string;
    ctaPath: string;  // 내부 라우팅 경로
    emoji: string;
    gradientFrom: string;
    gradientTo: string;
    startDate: string;  // ISO date (YYYY-MM-DD)
    endDate: string;    // ISO date (YYYY-MM-DD)
}

/**
 * 활성 캠페인 목록
 * 새 캠페인 추가/제거는 이 배열을 수정하면 됩니다.
 */
export const CAMPAIGNS: CampaignConfig[] = [
    {
        id: 'spring-2026',
        title: '봄맞이 사주 운세',
        subtitle: '새로운 시작을 앞둔 당신의 운명은?',
        ctaText: '봄 운세 받아보기',
        ctaPath: '/',
        emoji: '🌸',
        gradientFrom: '#ec4899',
        gradientTo: '#f97316',
        startDate: '2026-03-01',
        endDate: '2026-05-31',
    },
    // 여름 캠페인 예시 (비활성)
    // {
    //     id: 'summer-2026',
    //     title: '여름 특별 운세',
    //     subtitle: '뜨거운 여름, 당신의 운은?',
    //     ctaText: '여름 운세 보기',
    //     ctaPath: '/',
    //     emoji: '☀️',
    //     gradientFrom: '#f59e0b',
    //     gradientTo: '#ef4444',
    //     startDate: '2026-06-01',
    //     endDate: '2026-08-31',
    // },
];

/**
 * 현재 날짜 기준으로 활성 캠페인 반환
 * @returns 활성 캠페인 또는 null
 */
export function getActiveCampaign(): CampaignConfig | null {
    const now = new Date();
    // 날짜 비교를 위해 시간 제거
    now.setHours(0, 0, 0, 0);

    return CAMPAIGNS.find(c => {
        const start = new Date(c.startDate);
        const end = new Date(c.endDate);
        // endDate는 포함 (<=)
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
    }) ?? null;
}
