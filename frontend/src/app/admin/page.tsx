'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users,
    TrendingUp,
    AlertCircle,
    Coins,
    RefreshCw,
    Clock,
    Activity,
    Percent,
    BarChart3
} from 'lucide-react';
import { 
    getDashboard, 
    getDashboardTrends, 
    getKPIOverview,
    getRevenueTrend,
    DashboardStats, 
    RefundInfo, 
    TrendDataPoint,
    UserTrendByProvider,
    ProviderDistribution,
    KPIOverview,
    RevenueTrendData
} from '@/lib/adminApi';
import UserTrendChart from '@/components/admin/charts/UserTrendChart';
import ReadingTrendChart from '@/components/admin/charts/ReadingTrendChart';
import ProviderPieChart from '@/components/admin/charts/ProviderPieChart';
import DAUChart from '@/components/admin/charts/DAUChart';
import RevenueChart from '@/components/admin/charts/RevenueChart';
import KPIGrid from '@/components/admin/KPIGrid/KPIGrid';
import KPICard from '@/components/admin/KPICard/KPICard';
import DateRangePicker from '@/components/admin/DateRangePicker';
import styles from './page.module.css';

export default function AdminDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentRefunds, setRecentRefunds] = useState<RefundInfo[]>([]);
    
    const [userTrend, setUserTrend] = useState<TrendDataPoint[]>([]);
    const [userTrendByProvider, setUserTrendByProvider] = useState<UserTrendByProvider[]>([]);
    const [readingTrend, setReadingTrend] = useState<TrendDataPoint[]>([]);
    const [providerDistribution, setProviderDistribution] = useState<ProviderDistribution[]>([]);
    const [kpiData, setKpiData] = useState<KPIOverview | null>(null);
    const [revenueTrend, setRevenueTrend] = useState<RevenueTrendData[]>([]);
    
    const [selectedPeriod, setSelectedPeriod] = useState(7);
    const [customStartDate, setCustomStartDate] = useState<string | undefined>(undefined);
    const [customEndDate, setCustomEndDate] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [isTrendsLoading, setIsTrendsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const dashboardData = await getDashboard();
            setStats(dashboardData.stats);
            setRecentRefunds(dashboardData.recent_refunds);
            setLastUpdated(new Date());

            setIsTrendsLoading(true);
            const days = selectedPeriod === -1 ? 0 : selectedPeriod;
            const [kpiOverview, revTrend, trendsData] = await Promise.all([
                getKPIOverview(days, customStartDate, customEndDate),
                getRevenueTrend(days, customStartDate, customEndDate),
                getDashboardTrends(days, customStartDate, customEndDate)
            ]);

            setKpiData(kpiOverview);
            setRevenueTrend(revTrend.trend);
            setUserTrend(trendsData.user_trend);
            setUserTrendByProvider(trendsData.user_trend_by_provider || []);
            setReadingTrend(trendsData.reading_trend);
            setProviderDistribution(trendsData.provider_distribution || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
            setIsTrendsLoading(false);
        }
    }, [selectedPeriod, customStartDate, customEndDate]);

    useEffect(() => {
        fetchData();
        
        if (!autoRefresh) return;
        const intervalId = setInterval(fetchData, 60 * 1000);
        return () => clearInterval(intervalId);
    }, [fetchData, autoRefresh]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('ko-KR').format(num);
    };

    const dauData = readingTrend.map((item, index) => ({
        date: item.date,
        dau: userTrend[index]?.count || 0,
        page_views: item.count
    }));

    const revenueChartData = revenueTrend.map(item => ({
        date: item.date,
        revenue: item.revenue,
        transactions: item.transactions
    }));

    const handleCustomRange = (startDate: string, endDate: string) => {
        setCustomStartDate(startDate);
        setCustomEndDate(endDate);
    };

    const handlePeriodChange = (days: number) => {
        setSelectedPeriod(days);
        if (days !== -1) {
            setCustomStartDate(undefined);
            setCustomEndDate(undefined);
        }
    };

    const getPeriodLabel = () => {
        if (selectedPeriod === 0) return '전체';
        if (selectedPeriod === -1 && customStartDate && customEndDate) {
            return `${customStartDate} ~ ${customEndDate}`;
        }
        return `${selectedPeriod}일`;
    };

    if (isLoading && !stats) {
        return (
            <div className={styles.container} data-testid="admin-dashboard-page">
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>대시보드 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className={styles.container} data-testid="admin-dashboard-page">
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{error}</p>
                    <button type="button" onClick={fetchData} className={styles.retryButton}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} data-testid="admin-dashboard-page">
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title} data-testid="admin-dashboard-ready">대시보드</h1>
                    {lastUpdated && (
                        <p className={styles.subtitle}>
                            <Clock size={14} />
                            마지막 업데이트: {formatDate(lastUpdated.toISOString())}
                        </p>
                    )}
                </div>
                <div className={styles.headerActions}>
                    <button 
                        type="button"
                        className={`${styles.autoRefreshToggle} ${autoRefresh ? styles.autoRefreshActive : ''}`}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        aria-label="자동 새로고침 토글"
                    >
                        <span className={styles.autoRefreshDot} />
                        자동 새로고침
                    </button>
                    <button 
                        type="button"
                        className={styles.refreshButton} 
                        onClick={fetchData}
                        disabled={isLoading}
                        aria-label="새로고침"
                    >
                        <RefreshCw size={18} className={isLoading ? styles.spinning : ''} />
                        새로고침
                    </button>
                </div>
            </header>

            <section className={styles.kpiSection}>
                <KPIGrid>
                    <KPICard 
                        title="신규 사용자" 
                        value={formatNumber(kpiData?.new_users ?? 0)} 
                        changePercent={kpiData?.new_users_change ?? 0} 
                        icon={Users} 
                        trend={(kpiData?.new_users_change ?? 0) >= 0 ? 'up' : 'down'}
                    />
                    <KPICard 
                        title="DAU (활동)" 
                        value={formatNumber(kpiData?.dau ?? 0)} 
                        changePercent={kpiData?.dau_change ?? 0} 
                        icon={Activity} 
                        trend={(kpiData?.dau_change ?? 0) >= 0 ? 'up' : 'down'}
                    />
                    <KPICard 
                        title="총 수익" 
                        value={`₩${formatNumber(kpiData?.revenue ?? 0)}`} 
                        changePercent={kpiData?.revenue_change ?? 0} 
                        icon={Coins} 
                        trend={(kpiData?.revenue_change ?? 0) >= 0 ? 'up' : 'down'}
                    />
                    <KPICard 
                        title="AI 성공률" 
                        value={`${(kpiData?.success_rate ?? 0).toFixed(1)}%`} 
                        changePercent={kpiData?.success_rate_change ?? 0} 
                        icon={TrendingUp} 
                        trend={(kpiData?.success_rate_change ?? 0) >= 0 ? 'up' : 'down'}
                    />
                    <KPICard 
                        title="에러 발생" 
                        value={formatNumber(kpiData?.error_count ?? 0)} 
                        changePercent={kpiData?.error_count_change ?? 0} 
                        icon={AlertCircle} 
                        color="danger"
                        trend={(kpiData?.error_count_change ?? 0) <= 0 ? 'down' : 'up'}
                    />
                    <KPICard 
                        title="전환율" 
                        value={`${(kpiData?.conversion_rate ?? 0).toFixed(1)}%`} 
                        subtitle={kpiData ? `${kpiData.unique_payers}명 결제 / ${kpiData.total_signups}명 가입` : undefined}
                        icon={Percent} 
                        trend={(kpiData?.conversion_rate ?? 0) > 0 ? 'up' : 'neutral'}
                    />
                </KPIGrid>
            </section>

            <section className={styles.chartsSection}>
                <div className={styles.chartsSectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <BarChart3 size={20} />
                        통계 분석
                    </h2>
                    <DateRangePicker
                        selectedPeriod={selectedPeriod}
                        onPeriodChange={handlePeriodChange}
                        onCustomRange={handleCustomRange}
                    />
                </div>
                
                <div className={styles.chartsGrid}>
                    <DAUChart 
                        data={dauData} 
                        isLoading={isTrendsLoading} 
                        title={`DAU 및 페이지뷰 (${getPeriodLabel()})`}
                    />
                    <RevenueChart 
                        data={revenueChartData} 
                        isLoading={isTrendsLoading} 
                        title={`매출 추이 (${getPeriodLabel()})`}
                    />
                    <UserTrendChart 
                        data={userTrend} 
                        dataByProvider={userTrendByProvider}
                        isLoading={isTrendsLoading} 
                        title={`신규 가입 추이 (${getPeriodLabel()})`}
                    />
                    <ReadingTrendChart 
                        data={readingTrend} 
                        isLoading={isTrendsLoading}
                        title={`분석 요청 추이 (${getPeriodLabel()})`}
                    />
                    <ProviderPieChart 
                        data={providerDistribution}
                        isLoading={isTrendsLoading}
                        title={`가입 경로 분포 (${getPeriodLabel()})`}
                    />
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Coins size={20} />
                        최근 환불 내역
                    </h2>
                </div>
                
                {recentRefunds.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Coins size={40} />
                        <p>최근 환불 내역이 없습니다</p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>사용자 ID</th>
                                    <th>금액</th>
                                    <th>사유</th>
                                    <th>일시</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentRefunds.map((refund, index) => (
                                    <tr key={`${refund.created_at}-${index}`}>
                                        <td className={styles.userId}>
                                            {refund.user_id.slice(0, 8)}...
                                        </td>
                                        <td className={styles.amount}>
                                            {formatNumber(refund.amount)} 엽전
                                        </td>
                                        <td className={styles.reason}>{refund.reason}</td>
                                        <td className={styles.date}>
                                            {formatDate(refund.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
