'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    BarChart3,
    TrendingUp,
    AlertCircle,
    CheckCircle2,
    PlayCircle,
    Coins,
    RefreshCw,
    Clock,
    Filter,
    Users,
    Layers,
    Bot
} from 'lucide-react';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import {
    getAnalysisStats,
    getAnalysisTrend,
    getTopAnalysisUsers,
    getRevenueByFeature,
    getFunnelAnalysis,
    getCohortAnalysis,
    getSegmentAnalysis,
    getLLMStats,
    getTabEngagementStats,
    getSessionFunnel,
    TabEngagementResponse,
    SessionFunnelData,
    AnalysisStats,
    TrendData,
    TopUser,
    FunnelStep,
    CohortData,
    SegmentData,
    LLMStatsResponse
} from '@/lib/adminApi';
import KPICard from '@/components/admin/KPICard/KPICard';
import KPIGrid from '@/components/admin/KPIGrid/KPIGrid';
import ConversionFunnelChart from '@/components/admin/charts/ConversionFunnelChart';
import DateRangePicker from '@/components/admin/DateRangePicker';
import styles from './Analytics.module.css';

const TABS = [
    { id: 'all', label: '전체' },
    { id: 'reading', label: '메인분석' },
    { id: 'flow_ai_advice', label: '캘린더' },
    { id: 'compatibility', label: '궁합' },
    { id: 'ai_chat', label: '도사Q&A' },
];

const FEATURE_LABELS: Record<string, string> = {
    reading: '메인 분석',
    flow_ai_advice: '일간 캘린더',
    compatibility: '궁합 분석',
    ai_chat: '도사에게 질문',
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE'];

function resolveStrictStatsDays(
    selectedPeriod: number,
    customStartDate?: string,
    customEndDate?: string
): number {
    if (selectedPeriod === -1) {
        if (customStartDate && customEndDate) {
            const start = Date.parse(`${customStartDate}T00:00:00Z`);
            const end = Date.parse(`${customEndDate}T00:00:00Z`);
            if (Number.isFinite(start) && Number.isFinite(end)) {
                const diffDays = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
                return Math.min(Math.max(diffDays, 1), 365);
            }
        }
        return 7;
    }

    if (selectedPeriod === 0) {
        return 365;
    }

    return Math.min(Math.max(selectedPeriod, 1), 365);
}

export default function AnalyticsDashboardPage() {
    const [selectedPeriod, setSelectedPeriod] = useState(30);
    const [customStartDate, setCustomStartDate] = useState<string | undefined>(undefined);
    const [customEndDate, setCustomEndDate] = useState<string | undefined>(undefined);
    const [activeTab, setActiveTab] = useState('all');
    
    const [stats, setStats] = useState<AnalysisStats | null>(null);
    const [trend, setTrend] = useState<TrendData[]>([]);
    const [topUsers, setTopUsers] = useState<TopUser[]>([]);
    const [revenue, setRevenue] = useState<Record<string, number>>({});
    
    const [funnelData, setFunnelData] = useState<FunnelStep[]>([]);
    const [cohortData, setCohortData] = useState<CohortData[]>([]);
    const [segmentData, setSegmentData] = useState<SegmentData[]>([]);
    const [tabEngagement, setTabEngagement] = useState<TabEngagementResponse | null>(null);
    const [sessionFunnel, setSessionFunnel] = useState<SessionFunnelData | null>(null);
    const [llmStats, setLlmStats] = useState<LLMStatsResponse | null>(null);
    const [llmError, setLlmError] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setLlmError(null);
        try {
            const featureType = activeTab === 'all' ? undefined : activeTab;
            const days = selectedPeriod === -1 ? 0 : selectedPeriod;
            const strictStatsDays = resolveStrictStatsDays(
                selectedPeriod,
                customStartDate,
                customEndDate
            );

            const [analyticsResult, llmResult] = await Promise.allSettled([
                Promise.all([
                    getAnalysisStats(days, customStartDate, customEndDate),
                    getAnalysisTrend(activeTab === 'all' ? 'total' : activeTab, days, customStartDate, customEndDate),
                    getTopAnalysisUsers(days, 20, featureType, customStartDate, customEndDate),
                    getRevenueByFeature(days, customStartDate, customEndDate),
                    getFunnelAnalysis(days, customStartDate, customEndDate),
                    getCohortAnalysis(8),
                    getSegmentAnalysis(),
                    getTabEngagementStats(strictStatsDays, customStartDate, customEndDate),
                    getSessionFunnel(strictStatsDays, customStartDate, customEndDate)
                ]),
                getLLMStats(days)
            ]);

            if (analyticsResult.status === 'rejected') {
                throw analyticsResult.reason;
            }

            const [
                statsData,
                trendData,
                usersData,
                revenueData,
                funnelRes,
                cohortRes,
                segmentRes,
                tabEngagementRes,
                sessionFunnelRes
            ] = analyticsResult.value;

            setStats(statsData);
            setTrend(trendData);
            setTopUsers(usersData);
            setRevenue(revenueData);
            setFunnelData(funnelRes.steps);
            setCohortData(cohortRes.cohorts);
            setSegmentData(segmentRes.segments);
            setTabEngagement(tabEngagementRes);
            setSessionFunnel(sessionFunnelRes);

            if (llmResult.status === 'fulfilled') {
                setLlmStats(llmResult.value);
            } else {
                setLlmStats(null);
                setLlmError(
                    llmResult.reason instanceof Error
                        ? llmResult.reason.message
                        : 'LLM 사용량 데이터를 불러오지 못했습니다'
                );
            }

            setLastUpdated(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, [selectedPeriod, activeTab, customStartDate, customEndDate]);

    useEffect(() => {
        fetchData();
        
        if (!autoRefresh) return;
        const intervalId = setInterval(fetchData, 60 * 1000);
        return () => clearInterval(intervalId);
    }, [fetchData, autoRefresh]);

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

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

    const getKPIs = () => {
        if (!stats) return { started: 0, completed: 0, successRate: 0, uniqueUsers: 0, revenue: 0 };

        if (activeTab === 'all') {
            let started = 0;
            let completed = 0;
            
            Object.values(stats).forEach(s => {
                started += s.started;
                completed += s.completed;
            });
            
            const totalRevenue = Object.values(revenue).reduce((a, b) => a + b, 0);
            
            return {
                started,
                completed,
                successRate: started > 0 ? ((completed / started) * 100).toFixed(1) : 0,
                uniqueUsers: 'N/A', 
                revenue: totalRevenue
            };
        } else {
            const s = stats[activeTab] || { started: 0, completed: 0, failed: 0, success_rate: 0, unique_users: 0 };
            const rev = revenue[activeTab] || 0;
            return {
                started: s.started,
                completed: s.completed,
                successRate: s.success_rate.toFixed(1),
                uniqueUsers: s.unique_users,
                revenue: rev
            };
        }
    };

    const kpis = getKPIs();

    const pieData = Object.entries(stats || {}).map(([key, value]) => ({
        name: FEATURE_LABELS[key] || key,
        value: value.completed
    })).filter(item => item.value > 0);

    const hasLlmTrendData = (llmStats?.daily_trend || []).some((item) => item.call_count > 0);
    const tabEngagementData = Object.entries(tabEngagement?.by_tab || {}).map(([tab, data]) => ({
        name: FEATURE_LABELS[tab] || tab,
        avg_dwell_sec: Math.round(data.avg_dwell_ms / 1000),
        bounce_rate: Math.round(data.bounce_rate * 10000) / 100,
        event_count: data.event_count
    })).sort((a, b) => b.avg_dwell_sec - a.avg_dwell_sec);

    const sessionFunnelSteps = sessionFunnel?.steps.map(step => ({
        name: step.step === 'input_started' ? '입력 시작' :
              step.step === 'result_received' ? '결과 수신' :
              step.step === 'tab_clicked' ? '탭 탐색' :
              step.step === 'profile_saved' ? '저장/공유' : step.step,
        count: step.count,
        conversion_rate: step.conversion_rate
    })) || [];

    if (isLoading && !stats) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>통계 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className={styles.container}>
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
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>분석 이용 통계</h1>
                    {lastUpdated && (
                        <p className={styles.subtitle}>
                            <Clock size={14} />
                            마지막 업데이트: {formatDate(lastUpdated)}
                        </p>
                    )}
                </div>
                <div className={styles.headerActions}>
                    <DateRangePicker
                        selectedPeriod={selectedPeriod}
                        onPeriodChange={handlePeriodChange}
                        onCustomRange={handleCustomRange}
                    />
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
                        onClick={fetchData}
                        disabled={isLoading}
                        aria-label="새로고침"
                    >
                        <RefreshCw size={18} className={isLoading ? styles.spinning : ''} />
                    </button>
                </div>
            </header>

            <div className={styles.tabsContainer}>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`${styles.tabButton} ${
                            activeTab === tab.id
                                ? styles.tabButtonActive
                                : styles.tabButtonInactive
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <section className={styles.statsGrid}>
                <KPIGrid columns={4}>
                    <KPICard
                        title="시작된 분석"
                        value={kpis.started.toLocaleString()}
                        icon={PlayCircle}
                        color="info"
                    />
                    <KPICard
                        title="완료된 분석"
                        value={kpis.completed.toLocaleString()}
                        icon={CheckCircle2}
                        color="success"
                    />
                    <KPICard
                        title="성공률"
                        value={`${kpis.successRate}%`}
                        icon={TrendingUp}
                        color="primary"
                    />
                    <KPICard
                        title="예상 매출"
                        value={`${kpis.revenue.toLocaleString()} 엽전`}
                        icon={Coins}
                        color="warning"
                    />
                </KPIGrid>
            </section>

            <div className={styles.twoColumnGrid}>
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <BarChart3 size={20} />
                        일별 분석 추이
                    </h2>
                    <div className={styles.chartContainer}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis 
                                    dataKey="date" 
                                    tick={{ fontSize: 12 }} 
                                    tickFormatter={(val) => val.split('-').slice(1).join('/')} 
                                />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="started" name="시작" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="completed" name="완료" fill="#22C55E" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="failed" name="실패" fill="#EF4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <TrendingUp size={20} />
                        기능별 점유율 (완료 기준)
                    </h2>
                    {pieData.length > 0 ? (
                        <div className={styles.pieChartContainer}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => typeof value === 'number' ? value.toLocaleString() : value} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>데이터가 없습니다</p>
                        </div>
                    )}
                </section>
            </div>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <Bot size={20} />
                    LLM 사용량
                </h2>

                {isLoading && !llmStats && !llmError ? (
                    <div className={styles.emptyState}>
                        <p>LLM 사용량 로딩 중...</p>
                    </div>
                ) : llmError ? (
                    <div className={styles.inlineErrorState}>
                        <AlertCircle size={18} />
                        <p>{llmError}</p>
                    </div>
                ) : !llmStats || llmStats.models.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>집계된 LLM 사용량 데이터가 없습니다</p>
                    </div>
                ) : (
                    <div className={styles.llmGrid}>
                        <div className={styles.llmPanel}>
                            <h3 className={styles.llmPanelTitle}>일별 추이</h3>
                            <div className={styles.chartContainer}>
                                {hasLlmTrendData ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={llmStats.daily_trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fontSize: 12 }}
                                                tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                            />
                                            <YAxis tick={{ fontSize: 12 }} />
                                            <Tooltip
                                                formatter={(value, name) => [
                                                    typeof value === 'number' ? value.toLocaleString() : value,
                                                    name,
                                                ]}
                                            />
                                            <Legend />
                                            <Line
                                                type="monotone"
                                                dataKey="call_count"
                                                name="호출 수"
                                                stroke="#3B82F6"
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="success_count"
                                                name="성공 수"
                                                stroke="#22C55E"
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className={styles.emptyState}>
                                        <p>일별 추이 데이터가 없습니다</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.llmPanel}>
                            <h3 className={styles.llmPanelTitle}>모델별 요약</h3>
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead className={styles.tableHead}>
                                        <tr>
                                            <th className={styles.tableHeaderCell}>모델명</th>
                                            <th className={`${styles.tableHeaderCell} ${styles.tableCellRight}`}>호출 수</th>
                                            <th className={`${styles.tableHeaderCell} ${styles.tableCellRight}`}>성공률</th>
                                            <th className={`${styles.tableHeaderCell} ${styles.tableCellRight}`}>평균 토큰</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {llmStats.models.map((item) => (
                                            <tr key={`${item.provider}-${item.model}`} className={styles.tableRow}>
                                                <td className={`${styles.tableCell} ${styles.tableCellMedium}`}>
                                                    {item.provider}/{item.model}
                                                </td>
                                                <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                    {item.call_count.toLocaleString()}
                                                </td>
                                                <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                    {item.success_rate.toFixed(1)}%
                                                </td>
                                                <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                    {item.avg_tokens.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <Filter size={20} />
                    전환 퍼널 분석
                </h2>
                <div className={styles.chartContainer}>
                    <ConversionFunnelChart 
                        data={funnelData} 
                        isLoading={isLoading} 
                        title={`사용자 전환 퍼널 (${getPeriodLabel()})`}
                    />
                </div>
            </section>
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <Filter size={20} />
                    사용자 여정 퍼널
                </h2>
                <div className={styles.chartContainer}>
                    <ConversionFunnelChart 
                        data={sessionFunnelSteps} 
                        isLoading={isLoading} 
                        title={`사용자 여정 퍼널 (${getPeriodLabel()})`}
                    />
                </div>
            </section>

            <div className={styles.twoColumnGrid}>
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Clock size={20} />
                        탭별 평균 체류시간 (초)
                    </h2>
                    <div className={styles.chartContainer}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={tabEngagementData} 
                                layout="vertical" 
                                margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={100} />
                                <Tooltip formatter={(value) => [`${value}초`, '평균 체류시간']} />
                                <Bar dataKey="avg_dwell_sec" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                                    {tabEngagementData.map((entry, index) => (
                                        <Cell key={`dwell-cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <AlertCircle size={20} />
                        탭별 이탈률 (%)
                    </h2>
                    <div className={styles.chartContainer}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={tabEngagementData} 
                                layout="vertical" 
                                margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" domain={[0, 100]} />
                                <YAxis dataKey="name" type="category" width={100} />
                                <Tooltip formatter={(value) => [`${value}%`, '이탈률']} />
                                <Bar dataKey="bounce_rate" fill="#EF4444" radius={[0, 4, 4, 0]}>
                                    {tabEngagementData.map((entry, index) => (
                                        <Cell key={`bounce-cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            </div>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <Layers size={20} />
                    코호트 리텐션 (주간)
                </h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.cohortTable}>
                        <thead>
                            <tr>
                                <th>가입 주차</th>
                                <th>가입자</th>
                                {Array.from({ length: 8 }, (_, week) => week).map((week) => (
                                    <th key={`week-header-${week}`}>Week {week}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {cohortData.map((cohort) => (
                                <tr key={`cohort-row-${cohort.label}`}>
                                    <td>{cohort.label}</td>
                                    <td>{cohort.size}명</td>
                                    {cohort.retention.map((rate, j) => {
                                        const bgOpacity = rate / 100;
                                        const bgColor = `rgba(34, 197, 94, ${bgOpacity})`;
                                        return (
                                            <td key={`retention-${cohort.label}-${j}`} style={{ backgroundColor: bgColor, color: rate > 50 ? 'white' : 'black' }}>
                                                {rate}%
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* User Segments Section */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <Users size={20} />
                    사용자 세그먼트 분포
                </h2>
                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                            data={segmentData} 
                            layout="vertical" 
                            margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} />
                            <Tooltip formatter={(value) => [`${value}명`, '사용자 수']} />
                            <Bar dataKey="count" fill="#8884d8" radius={[0, 4, 4, 0]}>
                                {segmentData.map((entry, index) => (
                                    <Cell key={`segment-cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    <CheckCircle2 size={20} />
                    Top 이용자 (상위 20명)
                </h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead className={styles.tableHead}>
                            <tr>
                                <th className={styles.tableHeaderCell}>순위</th>
                                <th className={styles.tableHeaderCell}>사용자</th>
                                <th className={styles.tableHeaderCell}>이메일</th>
                                <th className={`${styles.tableHeaderCell} ${styles.tableCellRight}`}>분석 횟수</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topUsers.length > 0 ? (
                                topUsers.map((user, index) => (
                                    <tr key={user.user_id} className={styles.tableRow}>
                                        <td className={`${styles.tableCell} ${styles.tableCellMedium}`}>{index + 1}</td>
                                        <td className={`${styles.tableCell} ${styles.tableCellMedium}`}>{user.name || '알 수 없음'}</td>
                                        <td className={styles.tableCell}>{user.email}</td>
                                        <td className={`${styles.tableCell} ${styles.tableCellRight} ${styles.tableCellBold}`}>{user.count.toLocaleString()}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className={styles.emptyCell}>
                                        데이터가 없습니다
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
