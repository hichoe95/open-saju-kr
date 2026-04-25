'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    AlertCircle,
    AlertTriangle,
    BookOpenText,
    ClipboardList,
    Compass,
    ExternalLink,
    Gauge,
    Layers3,
    Lightbulb,
    MousePointerClick,
    RefreshCw,
    Sparkles,
    Users,
    Wallet,
} from 'lucide-react';

import KPICard from '@/components/admin/KPICard/KPICard';
import KPIGrid from '@/components/admin/KPIGrid/KPIGrid';
import ConversionFunnelChart from '@/components/admin/charts/ConversionFunnelChart';
import {
    getTrackingReport,
    type TrackingReportFinding,
    type TrackingReportResponse,
} from '@/lib/adminApi';

import styles from './page.module.css';

const KPI_ICON_MAP: Record<string, LucideIcon> = {
    tracked_users: Users,
    core_activation: Sparkles,
    core_focus: Compass,
    monetization_overlap: Wallet,
    response_time: Gauge,
};

const PAGE_LABELS: Record<string, string> = {
    home: '홈',
    mypage: '마이페이지',
    onboarding: '온보딩',
    charge: '충전',
    share_received: '공유 유입',
};

const FEATURE_LABELS: Record<string, string> = {
    reading: '메인 분석',
    compatibility: '궁합 분석',
    flow_ai_advice: 'AI 흐름 조언',
    ai_chat: '도사 Q&A',
};

function formatDateTime(value: string): string {
    return new Date(value).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatNumber(value: number): string {
    return value.toLocaleString('ko-KR');
}

function getKpiColor(
    tone: 'neutral' | 'positive' | 'warning' | 'critical'
): 'info' | 'success' | 'warning' | 'danger' {
    switch (tone) {
        case 'positive':
            return 'success';
        case 'warning':
            return 'warning';
        case 'critical':
            return 'danger';
        default:
            return 'info';
    }
}

function getFindingClass(tone: TrackingReportFinding['tone']): string {
    switch (tone) {
        case 'positive':
            return styles.findingPositive;
        case 'critical':
            return styles.findingCritical;
        default:
            return styles.findingWarning;
    }
}

function getPriorityClass(priority: 'high' | 'medium' | 'low'): string {
    switch (priority) {
        case 'high':
            return styles.priorityHigh;
        case 'medium':
            return styles.priorityMedium;
        default:
            return styles.priorityLow;
    }
}

function getPriorityLabel(priority: 'high' | 'medium' | 'low'): string {
    switch (priority) {
        case 'high':
            return '높음';
        case 'medium':
            return '중간';
        default:
            return '낮음';
    }
}

export default function AdminTrackingReportPage() {
    const [report, setReport] = useState<TrackingReportResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchReport = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getTrackingReport();
            setReport(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '리포트를 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const funnelData = useMemo(
        () =>
            (report?.journey_funnel || []).map((step) => ({
                name: step.name,
                count: step.count,
                conversion_rate: step.conversion_rate,
            })),
        [report]
    );

    if (isLoading && !report) {
        return (
            <div className={styles.container}>
                <div className={styles.stateCard}>
                    <div className={styles.spinner} />
                    <p>추적 리포트를 불러오는 중입니다...</p>
                </div>
            </div>
        );
    }

    if (error && !report) {
        return (
            <div className={styles.container}>
                <div className={styles.stateCard}>
                    <AlertCircle size={28} />
                    <p>{error}</p>
                    <button type="button" className={styles.retryButton} onClick={fetchReport}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className={styles.container}>
                <div className={styles.stateCard}>
                    <ClipboardList size={28} />
                    <p>표시할 추적 리포트가 없습니다.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <div className={styles.eyebrow}>운영자용 추적 분석 리포트</div>
                    <h1 className={styles.title}>사용자 기록 추적 분석 보고서</h1>
                    <p className={styles.subtitle}>{report.executive_subtitle}</p>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.generatedAt}>생성 시각: {formatDateTime(report.generated_at)}</div>
                    <button
                        type="button"
                        className={styles.refreshButton}
                        onClick={fetchReport}
                        disabled={isLoading}
                    >
                        <RefreshCw size={16} className={isLoading ? styles.spinningIcon : ''} />
                        새로고침
                    </button>
                </div>
            </header>

            <section className={styles.heroCard}>
                <div className={styles.heroCopy}>
                    <h2 className={styles.heroTitle}>{report.executive_summary}</h2>
                    <p className={styles.heroText}>{report.journey_funnel_note}</p>
                </div>
                <div className={styles.sampleGrid}>
                    <div className={styles.sampleItem}>
                        <span className={styles.sampleLabel}>추적 사용자</span>
                        <strong>{formatNumber(report.sample_size.tracked_users)}명</strong>
                    </div>
                    <div className={styles.sampleItem}>
                        <span className={styles.sampleLabel}>추적 세션</span>
                        <strong>{formatNumber(report.sample_size.tracked_sessions)}개</strong>
                    </div>
                    <div className={styles.sampleItem}>
                        <span className={styles.sampleLabel}>총 이벤트</span>
                        <strong>{formatNumber(report.sample_size.total_events)}건</strong>
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Sparkles size={20} />
                        핵심 상태 요약
                    </h2>
                </div>
                <KPIGrid columns={4}>
                    {report.kpis.map((kpi) => {
                        const Icon = KPI_ICON_MAP[kpi.key] || ClipboardList;
                        return (
                            <KPICard
                                key={kpi.key}
                                title={kpi.label}
                                value={kpi.value}
                                subtitle={kpi.context}
                                icon={Icon}
                                color={getKpiColor(kpi.tone)}
                            />
                        );
                    })}
                </KPIGrid>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <MousePointerClick size={20} />
                        핵심 여정 퍼널
                    </h2>
                    <p className={styles.sectionDescription}>
                        이벤트 수 기준 퍼널입니다. 시작→완료 구간 외에는 방향성 중심으로 읽는 편이 안전합니다.
                    </p>
                </div>
                <div className={styles.chartWrap}>
                    <ConversionFunnelChart data={funnelData} title="이벤트 기준 퍼널" />
                </div>
                <ul className={styles.funnelNotes}>
                    {report.journey_funnel.map((step) => (
                        <li key={step.name} className={styles.funnelNoteItem}>
                            <strong>{step.name}</strong>
                            <span>
                                {formatNumber(step.count)}건 · 직전 대비 {step.conversion_rate.toFixed(1)}%
                            </span>
                            {step.note && <p>{step.note}</p>}
                        </li>
                    ))}
                </ul>
            </section>

            <div className={styles.twoColumnGrid}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <Layers3 size={20} />
                            페이지 이용 분포
                        </h2>
                    </div>
                    {report.page_focus.length === 0 ? (
                        <p className={styles.emptyList}>집계된 페이지 이용 데이터가 없습니다.</p>
                    ) : (
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>페이지</th>
                                        <th>조회수</th>
                                        <th>방문자</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.page_focus.map((item) => (
                                        <tr key={item.page}>
                                            <td>{PAGE_LABELS[item.page] || item.page}</td>
                                            <td>{formatNumber(item.views)}</td>
                                            <td>{formatNumber(item.visitors)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <Compass size={20} />
                            기능 집중도
                        </h2>
                    </div>
                    <div className={styles.cardList}>
                        {report.feature_focus.map((item) => (
                            <article key={item.feature} className={styles.metricCard}>
                                <div className={styles.metricCardHeader}>
                                    <h3>{FEATURE_LABELS[item.feature] || item.feature}</h3>
                                    <span>{formatNumber(item.usage_count)}회</span>
                                </div>
                                <p className={styles.metricMeta}>고유 사용자 {formatNumber(item.unique_users)}명</p>
                                <p className={styles.metricInsight}>{item.insight}</p>
                            </article>
                        ))}
                    </div>
                </section>
            </div>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <BookOpenText size={20} />
                        탭별 콘텐츠 품질 신호
                    </h2>
                    <p className={styles.sectionDescription}>
                        평균 체류시간과 이탈률을 함께 보며, 깊게 읽히는 탭과 초반에 이탈하는 탭을 구분했습니다.
                    </p>
                </div>
                {report.tab_insights.length === 0 ? (
                    <p className={styles.emptyList}>탭 체류 데이터가 아직 없습니다.</p>
                ) : (
                    <div className={styles.tabGrid}>
                        {report.tab_insights.map((item) => (
                            <article key={item.tab_name} className={styles.tabCard}>
                                <div className={styles.metricCardHeader}>
                                    <h3>{FEATURE_LABELS[item.tab_name] || item.tab_name}</h3>
                                    <span>{formatNumber(item.event_count)}회</span>
                                </div>
                                <div className={styles.tabStatsRow}>
                                    <span>평균 체류 {item.avg_dwell_seconds.toFixed(1)}초</span>
                                    <span>이탈률 {item.bounce_rate.toFixed(1)}%</span>
                                </div>
                                <p className={styles.metricInsight}>{item.insight}</p>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Wallet size={20} />
                        결제 세그먼트
                    </h2>
                    <p className={styles.sectionDescription}>
                        무과금, 1회 결제, 반복 결제 사용자를 나눠 평균 분석 수와 평균 결제 금액을 비교했습니다.
                    </p>
                </div>
                <div className={styles.segmentGrid}>
                    {report.payer_segments.map((segment) => (
                        <article key={segment.segment} className={styles.segmentCard}>
                            <div className={styles.metricCardHeader}>
                                <h3>{segment.segment}</h3>
                                <span>{formatNumber(segment.users)}명</span>
                            </div>
                            <div className={styles.segmentMetrics}>
                                <div>
                                    <strong>{segment.avg_readings.toFixed(1)}</strong>
                                    <span>평균 분석 수</span>
                                </div>
                                <div>
                                    <strong>{formatNumber(segment.avg_paid_amount)}</strong>
                                    <span>평균 결제 금액</span>
                                </div>
                            </div>
                            <p className={styles.metricInsight}>{segment.insight}</p>
                        </article>
                    ))}
                </div>
            </section>

            <div className={styles.twoColumnGrid}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <AlertTriangle size={20} />
                            지금 봐야 할 리스크
                        </h2>
                    </div>
                    <ul className={styles.findingList}>
                        {report.risks.map((item) => (
                            <li key={item.title} className={`${styles.findingItem} ${getFindingClass(item.tone)}`}>
                                <h3>{item.title}</h3>
                                <p className={styles.findingSummary}>{item.summary}</p>
                                <p className={styles.findingDetail}>{item.detail}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <Lightbulb size={20} />
                            기회 신호
                        </h2>
                    </div>
                    <ul className={styles.findingList}>
                        {report.opportunities.map((item) => (
                            <li key={item.title} className={`${styles.findingItem} ${getFindingClass(item.tone)}`}>
                                <h3>{item.title}</h3>
                                <p className={styles.findingSummary}>{item.summary}</p>
                                <p className={styles.findingDetail}>{item.detail}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Lightbulb size={20} />
                        개선 제안
                    </h2>
                    <p className={styles.sectionDescription}>
                        우선순위와 기대효과가 보이도록 실행 액션 단위로 정리했습니다.
                    </p>
                </div>
                <div className={styles.recommendationGrid}>
                    {report.recommendations.map((item) => (
                        <article key={item.title} className={styles.recommendationCard}>
                            <div className={styles.recommendationHeader}>
                                <span className={`${styles.priorityBadge} ${getPriorityClass(item.priority)}`}>
                                    {getPriorityLabel(item.priority)}
                                </span>
                                <h3>{item.title}</h3>
                            </div>
                            <p className={styles.recommendationRationale}>{item.rationale}</p>
                            <ul className={styles.actionList}>
                                {item.actions.map((action) => (
                                    <li key={action}>{action}</li>
                                ))}
                            </ul>
                            <div className={styles.expectedImpact}>
                                <strong>예상 효과</strong>
                                <p>{item.expected_impact}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <ExternalLink size={20} />
                        외부 근거
                    </h2>
                    <p className={styles.sectionDescription}>
                        개선안을 과장 없이 해석하기 위해 참고한 공식 문서와 연구 프레임입니다.
                    </p>
                </div>
                <div className={styles.evidenceGrid}>
                    {report.evidence.map((item) => (
                        <a
                            key={`${item.source}-${item.title}`}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.evidenceCard}
                        >
                            <div className={styles.evidenceHeader}>
                                <strong>{item.title}</strong>
                                <ExternalLink size={14} />
                            </div>
                            <div className={styles.evidenceMeta}>
                                <span>{item.source}</span>
                                <span>{item.supports}</span>
                            </div>
                            <p>{item.takeaway}</p>
                        </a>
                    ))}
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <AlertCircle size={20} />
                        해석 시 주의할 점
                    </h2>
                </div>
                <ul className={styles.limitationsList}>
                    {report.limitations.map((item) => (
                        <li key={item} className={styles.limitationItem}>
                            <AlertCircle size={16} />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
