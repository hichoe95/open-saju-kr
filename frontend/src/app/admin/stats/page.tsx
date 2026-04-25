'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Share2,
    Eye,
    UserPlus,
    Repeat,
    TrendingUp,
    AlertCircle,
    RefreshCw,
    Clock,
    BarChart3,
    Layers,
    ArrowRight,
} from 'lucide-react';
import {
    getShareStats,
    getFeatureStats,
    getTabStats,
    getViralFunnel,
    ShareStats,
    FeatureStats,
    TabStats,
    ViralFunnel,
} from '@/lib/adminApi';
import styles from './page.module.css';

const PERIOD_OPTIONS = [
    { value: 7, label: '7일' },
    { value: 14, label: '14일' },
    { value: 30, label: '30일' },
];

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    subtitle?: string;
    color: 'purple' | 'blue' | 'green' | 'orange' | 'pink';
}

function StatCard({ title, value, icon, subtitle, color }: StatCardProps) {
    return (
        <div className={`${styles.statCard} ${styles[color]}`}>
            <div className={styles.statIcon}>{icon}</div>
            <div className={styles.statContent}>
                <span className={styles.statTitle}>{title}</span>
                <span className={styles.statValue}>{value}</span>
                {subtitle && <span className={styles.statSubtitle}>{subtitle}</span>}
            </div>
        </div>
    );
}

interface FunnelStepProps {
    label: string;
    value: number;
    rate?: string;
    isLast?: boolean;
}

function FunnelStep({ label, value, rate, isLast }: FunnelStepProps) {
    return (
        <>
            <div className={styles.funnelStep}>
                <div className={styles.funnelValue}>{value.toLocaleString()}</div>
                <div className={styles.funnelLabel}>{label}</div>
                {rate && <div className={styles.funnelRate}>{rate}</div>}
            </div>
            {!isLast && (
                <div className={styles.funnelArrow}>
                    <ArrowRight size={20} />
                </div>
            )}
        </>
    );
}

export default function AnalyticsStatsPage() {
    const [shareStats, setShareStats] = useState<ShareStats | null>(null);
    const [featureStats, setFeatureStats] = useState<FeatureStats | null>(null);
    const [tabStats, setTabStats] = useState<TabStats | null>(null);
    const [viralFunnel, setViralFunnel] = useState<ViralFunnel | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState(30);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchAllStats = useCallback(async (days: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const [shares, features, tabs, funnel] = await Promise.all([
                getShareStats(days),
                getFeatureStats(days),
                getTabStats(days),
                getViralFunnel(days),
            ]);
            setShareStats(shares);
            setFeatureStats(features);
            setTabStats(tabs);
            setViralFunnel(funnel);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllStats(selectedPeriod);
    }, [selectedPeriod, fetchAllStats]);

    useEffect(() => {
        if (!autoRefresh) return;
        const intervalId = setInterval(() => {
            fetchAllStats(selectedPeriod);
        }, 60 * 1000);
        return () => clearInterval(intervalId);
    }, [autoRefresh, selectedPeriod, fetchAllStats]);

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getTabLabel = (tabKey: string) => {
        const labels: Record<string, string> = {
            summary: '종합',
            lucky: '행운',
            love: '연애',
            money: '금전',
            career: '직장',
            study: '학업',
            health: '건강',
            compatibility: '관계',
            life: '인생',
            daeun: '대운',
        };
        return labels[tabKey] || tabKey;
    };

    const getFeatureLabel = (featureKey: string) => {
        const labels: Record<string, string> = {
            share_created: '공유 생성',
            share_viewed: '공유 조회',
            share_converted: '공유 전환',
            ai_chat: 'AI 채팅',
            presentation_view: '카드 보기',
            compatibility_analysis: '궁합 분석',
        };
        if (featureKey.startsWith('tab_')) {
            return `탭: ${getTabLabel(featureKey.replace('tab_', ''))}`;
        }
        return labels[featureKey] || featureKey;
    };

    if (isLoading && !shareStats) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>통계 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error && !shareStats) {
        return (
            <div className={styles.container}>
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{error}</p>
                    <button type="button" onClick={() => fetchAllStats(selectedPeriod)} className={styles.retryButton}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>공유 & 기능 통계</h1>
                    {lastUpdated && (
                        <p className={styles.subtitle}>
                            <Clock size={14} />
                            마지막 업데이트: {formatDate(lastUpdated)}
                        </p>
                    )}
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.periodSelector}>
                        {PERIOD_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`${styles.periodButton} ${selectedPeriod === option.value ? styles.periodActive : ''}`}
                                onClick={() => setSelectedPeriod(option.value)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <button 
                        type="button"
                        className={`${styles.autoRefreshToggle} ${autoRefresh ? styles.autoRefreshActive : ''}`}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        aria-label="자동 새로고침 토글"
                    >
                        <span className={styles.autoRefreshDot} />
                    </button>
                    <button
                        type="button"
                        className={styles.refreshButton}
                        onClick={() => fetchAllStats(selectedPeriod)}
                        disabled={isLoading}
                        aria-label="새로고침"
                    >
                        <RefreshCw size={18} className={isLoading ? styles.spinning : ''} />
                    </button>
                </div>
            </header>

            {/* 공유 통계 요약 */}
            <section className={styles.statsGrid}>
                <StatCard
                    title="총 공유 생성"
                    value={shareStats?.total_shares.toLocaleString() || '0'}
                    icon={<Share2 size={24} />}
                    color="purple"
                />
                <StatCard
                    title="총 공유 조회"
                    value={shareStats?.total_views.toLocaleString() || '0'}
                    icon={<Eye size={24} />}
                    color="blue"
                />
                <StatCard
                    title="공유 전환"
                    value={shareStats?.total_conversions.toLocaleString() || '0'}
                    icon={<UserPlus size={24} />}
                    subtitle={`전환율 ${shareStats?.conversion_rate || 0}%`}
                    color="green"
                />
                <StatCard
                    title="재공유 (추정)"
                    value={viralFunnel?.reshares.toLocaleString() || '0'}
                    icon={<Repeat size={24} />}
                    color="orange"
                />
            </section>

            {/* 바이럴 퍼널 */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <TrendingUp size={20} />
                    바이럴 퍼널
                </h2>
                <div className={styles.funnelContainer}>
                    <FunnelStep
                        label="공유 생성"
                        value={viralFunnel?.shares_created || 0}
                    />
                    <FunnelStep
                        label="공유 조회"
                        value={viralFunnel?.shares_viewed || 0}
                        rate={viralFunnel ? `${(viralFunnel.funnel_rates.view_rate * 100).toFixed(1)}%` : undefined}
                    />
                    <FunnelStep
                        label="가입 전환"
                        value={viralFunnel?.signups_from_share || 0}
                        rate={viralFunnel ? `${viralFunnel.funnel_rates.conversion_rate}%` : undefined}
                    />
                    <FunnelStep
                        label="재공유"
                        value={viralFunnel?.reshares || 0}
                        rate={viralFunnel ? `${viralFunnel.funnel_rates.reshare_rate}%` : undefined}
                        isLast
                    />
                </div>
            </section>

            {/* 공유 유형별 / 방법별 통계 */}
            <div className={styles.twoColumnGrid}>
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Layers size={20} />
                        공유 유형별
                    </h2>
                    {shareStats && Object.keys(shareStats.by_type).length > 0 ? (
                        <div className={styles.barList}>
                            {Object.entries(shareStats.by_type)
                                .sort(([, a], [, b]) => b - a)
                                .map(([type, count]) => {
                                    const maxCount = Math.max(...Object.values(shareStats.by_type));
                                    const percentage = (count / maxCount) * 100;
                                    return (
                                        <div key={type} className={styles.barItem}>
                                            <div className={styles.barLabel}>
                                                <span>{type === 'saju' ? '사주' : type === 'compatibility' ? '궁합' : type}</span>
                                                <span className={styles.barCount}>{count.toLocaleString()}</span>
                                            </div>
                                            <div className={styles.barTrack}>
                                                <div className={styles.barFill} style={{ width: `${percentage}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>데이터가 없습니다</p>
                        </div>
                    )}
                </section>

                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Share2 size={20} />
                        공유 방법별
                    </h2>
                    {shareStats && Object.keys(shareStats.by_method).length > 0 ? (
                        <div className={styles.barList}>
                            {Object.entries(shareStats.by_method)
                                .sort(([, a], [, b]) => b - a)
                                .map(([method, count]) => {
                                    const maxCount = Math.max(...Object.values(shareStats.by_method));
                                    const percentage = (count / maxCount) * 100;
                                    const methodLabels: Record<string, string> = {
                                        kakao: '카카오톡',
                                        link: '링크 복사',
                                        download: '이미지 저장',
                                        unknown: '기타',
                                    };
                                    return (
                                        <div key={method} className={styles.barItem}>
                                            <div className={styles.barLabel}>
                                                <span>{methodLabels[method] || method}</span>
                                                <span className={styles.barCount}>{count.toLocaleString()}</span>
                                            </div>
                                            <div className={styles.barTrack}>
                                                <div className={`${styles.barFill} ${styles.barFillBlue}`} style={{ width: `${percentage}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>데이터가 없습니다</p>
                        </div>
                    )}
                </section>
            </div>

            {/* 탭 사용량 */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <BarChart3 size={20} />
                    탭 사용량
                </h2>
                {tabStats && Object.keys(tabStats.by_tab).length > 0 ? (
                    <div className={styles.barList}>
                        {Object.entries(tabStats.by_tab)
                            .sort(([, a], [, b]) => b - a)
                            .map(([tab, count]) => {
                                const maxCount = Math.max(...Object.values(tabStats.by_tab));
                                const percentage = (count / maxCount) * 100;
                                return (
                                    <div key={tab} className={styles.barItem}>
                                        <div className={styles.barLabel}>
                                            <span>{getTabLabel(tab)}</span>
                                            <span className={styles.barCount}>{count.toLocaleString()}</span>
                                        </div>
                                        <div className={styles.barTrack}>
                                            <div className={`${styles.barFill} ${styles.barFillGreen}`} style={{ width: `${percentage}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        <p>탭 사용량 데이터가 없습니다</p>
                    </div>
                )}
            </section>

            {/* 기능 사용량 */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <Layers size={20} />
                    기능 사용량
                </h2>
                {featureStats && Object.keys(featureStats.by_feature).length > 0 ? (
                    <div className={styles.featureGrid}>
                        {Object.entries(featureStats.by_feature)
                            .sort(([, a], [, b]) => b.count - a.count)
                            .slice(0, 12)
                            .map(([feature, data]) => (
                                <div key={feature} className={styles.featureCard}>
                                    <div className={styles.featureName}>{getFeatureLabel(feature)}</div>
                                    <div className={styles.featureCount}>{data.count.toLocaleString()}</div>
                                    <div className={styles.featureUsers}>
                                        {data.unique_users.toLocaleString()} 사용자
                                    </div>
                                </div>
                            ))}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        <p>기능 사용량 데이터가 없습니다</p>
                    </div>
                )}
            </section>
        </div>
    );
}
