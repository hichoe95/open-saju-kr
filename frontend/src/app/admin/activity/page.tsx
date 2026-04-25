'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    Activity,
    AlertCircle,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Coins,
    CreditCard,
    Filter,
    Globe,
    Search,
    X,
} from 'lucide-react';
import {
    ActivitySearchResult,
    TimelineResponse,
    getUserTimeline,
    searchUserActivity,
} from '@/lib/adminApi';
import styles from './page.module.css';

const SOURCE_LABELS: Record<string, string> = {
    analytics: '분석 이벤트',
    api_log: 'API 요청',
    coin: '코인 거래',
    payment: '결제',
};

const EVENT_TYPE_OPTIONS = [
    { value: '', label: '전체' },
    { value: 'analytics', label: '분석 이벤트' },
    { value: 'api_log', label: 'API 요청' },
    { value: 'coin', label: '코인 거래' },
    { value: 'payment', label: '결제' },
];

function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function shortId(value?: string | null): string {
    if (!value) return '-';
    return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

function formatJson(value: unknown): string {
    if (value === null || value === undefined) return '(없음)';
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export default function AdminActivityPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ActivitySearchResult[]>([]);
    const [searchTotal, setSearchTotal] = useState(0);
    const [searchPage, setSearchPage] = useState(1);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
    const [timelinePage, setTimelinePage] = useState(1);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [eventTypeFilter, setEventTypeFilter] = useState('');
    const [isTimelineLoading, setIsTimelineLoading] = useState(false);
    const [timelineError, setTimelineError] = useState<string | null>(null);
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

    const LIMIT = 20;
    const searchTotalPages = Math.max(1, Math.ceil(searchTotal / LIMIT));
    const timelineTotalPages = Math.max(1, Math.ceil((timelineData?.total || 0) / 50));

    const fetchSearchResults = useCallback(async (page: number) => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setSearchTotal(0);
            return;
        }

        setIsSearchLoading(true);
        setSearchError(null);

        try {
            const data = await searchUserActivity(searchQuery, page, LIMIT);
            setSearchResults(data.users);
            setSearchTotal(data.total);
        } catch (err) {
            setSearchError(err instanceof Error ? err.message : '사용자 검색에 실패했습니다');
        } finally {
            setIsSearchLoading(false);
        }
    }, [searchQuery]);

    const fetchTimeline = useCallback(async () => {
        if (!selectedUserId) return;

        setIsTimelineLoading(true);
        setTimelineError(null);

        try {
            const data = await getUserTimeline(
                selectedUserId,
                timelinePage,
                50,
                startDate || undefined,
                endDate || undefined,
                eventTypeFilter || undefined
            );
            setTimelineData(data);
        } catch (err) {
            setTimelineError(err instanceof Error ? err.message : '타임라인 조회에 실패했습니다');
        } finally {
            setIsTimelineLoading(false);
        }
    }, [selectedUserId, timelinePage, startDate, endDate, eventTypeFilter]);

    useEffect(() => {
        if (selectedUserId) {
            fetchTimeline();
        }
    }, [fetchTimeline, selectedUserId]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchPage(1);
        fetchSearchResults(1);
    };

    const handleUserClick = (userId: string) => {
        setSelectedUserId(userId);
        setTimelinePage(1);
        setStartDate('');
        setEndDate('');
        setEventTypeFilter('');
        setExpandedItemId(null);
    };

    const handleBackToSearch = () => {
        setSelectedUserId(null);
        setTimelineData(null);
    };

    const handleTimelineFilterChange = () => {
        setTimelinePage(1);
    };

    const toggleItemDetails = (itemId: string) => {
        setExpandedItemId((prev) => (prev === itemId ? null : itemId));
    };

    const getSourceIcon = (source: string) => {
        switch (source) {
            case 'analytics':
                return <BarChart3 size={16} />;
            case 'api_log':
                return <Globe size={16} />;
            case 'coin':
                return <Coins size={16} />;
            case 'payment':
                return <CreditCard size={16} />;
            default:
                return <Activity size={16} />;
        }
    };

    const getSourceDotClass = (source: string) => {
        switch (source) {
            case 'analytics':
                return styles.dotAnalytics;
            case 'api_log':
                return styles.dotApiLog;
            case 'coin':
                return styles.dotCoin;
            case 'payment':
                return styles.dotPayment;
            default:
                return '';
        }
    };

    if (selectedUserId) {
        return (
            <div className={styles.container} data-testid="admin-activity-page">
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button
                            type="button"
                            onClick={handleBackToSearch}
                            className={styles.backButton}
                            aria-label="검색으로 돌아가기"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div>
                            <h1 className={styles.title}>
                                <Activity size={28} />
                                활동 타임라인
                            </h1>
                            <p className={styles.subtitle}>
                                {timelineData?.user_info?.name || '알 수 없음'} (
                                {shortId(selectedUserId)})
                            </p>
                        </div>
                    </div>
                </header>

                <div className={styles.filtersSection}>
                    <div className={styles.filterGroup}>
                        <Filter size={16} className={styles.filterIcon} />
                        <select
                            value={eventTypeFilter}
                            onChange={(e) => {
                                setEventTypeFilter(e.target.value);
                                handleTimelineFilterChange();
                            }}
                            className={styles.filterSelect}
                            aria-label="이벤트 타입 필터"
                        >
                            {EVENT_TYPE_OPTIONS.map((option) => (
                                <option key={option.value || 'all'} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>

                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                handleTimelineFilterChange();
                            }}
                            className={styles.dateInput}
                            aria-label="시작일"
                        />

                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => {
                                setEndDate(e.target.value);
                                handleTimelineFilterChange();
                            }}
                            className={styles.dateInput}
                            aria-label="종료일"
                        />

                        {(startDate || endDate) && (
                            <button
                                type="button"
                                className={styles.clearButton}
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setTimelinePage(1);
                                }}
                            >
                                날짜 초기화
                            </button>
                        )}
                    </div>
                </div>

                {isTimelineLoading && !timelineData ? (
                    <div className={styles.loadingState}>
                        <div className={styles.spinner} />
                        <p>타임라인 로딩 중...</p>
                    </div>
                ) : timelineError ? (
                    <div className={styles.errorState}>
                        <AlertCircle size={48} />
                        <p>{timelineError}</p>
                        <button type="button" onClick={fetchTimeline} className={styles.retryButton}>
                            다시 시도
                        </button>
                    </div>
                ) : (
                    <>
                        <div className={styles.timelineWrapper}>
                            <div className={styles.timeline}>
                                {timelineData?.timeline.length === 0 ? (
                                    <div className={styles.emptyState}>
                                        표시할 활동 내역이 없습니다
                                    </div>
                                ) : (
                                    timelineData?.timeline.map((item) => (
                                        <div key={item.id} className={styles.timelineItem}>
                                            <div
                                                className={`${styles.timelineDot} ${getSourceDotClass(
                                                    item.source
                                                )}`}
                                            >
                                                {getSourceIcon(item.source)}
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.timelineContent}
                                                onClick={() => toggleItemDetails(item.id)}
                                            >
                                                <div className={styles.timelineHeader}>
                                                    <span className={styles.timelineTime}>
                                                        {formatDateTime(item.timestamp)}
                                                    </span>
                                                    <span className={styles.sourceBadge}>
                                                        {SOURCE_LABELS[item.source] || item.source}
                                                    </span>
                                                </div>
                                                <div className={styles.timelineSummary}>
                                                    {item.summary}
                                                </div>
                                                {expandedItemId === item.id && (
                                                    <div className={styles.expandedDetails}>
                                                        <pre className={styles.codeBlock}>
                                                            {formatJson(item.details)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {timelineData && timelineData.total > 0 && (
                            <div className={styles.pagination}>
                                <button
                                    type="button"
                                    className={styles.pageButton}
                                    onClick={() => setTimelinePage((prev) => Math.max(1, prev - 1))}
                                    disabled={timelinePage === 1}
                                    aria-label="이전 페이지"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className={styles.pageInfo}>
                                    {timelinePage} / {timelineTotalPages}
                                </span>
                                <button
                                    type="button"
                                    className={styles.pageButton}
                                    onClick={() =>
                                        setTimelinePage((prev) =>
                                            Math.min(timelineTotalPages, prev + 1)
                                        )
                                    }
                                    disabled={timelinePage === timelineTotalPages}
                                    aria-label="다음 페이지"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    return (
        <div className={styles.container} data-testid="admin-activity-page">
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title} data-testid="admin-activity-ready">
                        <Activity size={28} />
                        활동 로그
                    </h1>
                    <p className={styles.subtitle}>사용자별 통합 활동 내역 검색</p>
                </div>
            </header>

            <div className={styles.filtersSection}>
                <form onSubmit={handleSearch} className={styles.searchForm}>
                    <div className={styles.searchInputWrapper}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="사용자 이름 또는 ID로 검색..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.clearSearchButton}
                                onClick={() => {
                                    setSearchQuery('');
                                    setSearchResults([]);
                                    setSearchTotal(0);
                                }}
                                aria-label="검색어 지우기"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <button type="submit" className={styles.searchButton} disabled={isSearchLoading}>
                        검색
                    </button>
                </form>
            </div>

            {isSearchLoading ? (
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>검색 중...</p>
                </div>
            ) : searchError ? (
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{searchError}</p>
                </div>
            ) : (
                <>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>이름</th>
                                    <th>이메일</th>
                                    <th>제공자</th>
                                    <th>상태</th>
                                    <th>최근 활동</th>
                                </tr>
                            </thead>
                            <tbody>
                                {searchResults.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className={styles.emptyCell}>
                                            {searchQuery
                                                ? '검색 결과가 없습니다'
                                                : '검색어를 입력하여 사용자를 찾으세요'}
                                        </td>
                                    </tr>
                                ) : (
                                    searchResults.map((user) => (
                                        <tr
                                            key={user.id}
                                            className={styles.userRow}
                                            onClick={() => handleUserClick(user.id)}
                                        >
                                            <td className={styles.userId}>
                                                <code>{shortId(user.id)}</code>
                                            </td>
                                            <td>{user.name || '-'}</td>
                                            <td>{user.email || '-'}</td>
                                            <td>
                                                <span className={styles.providerBadge}>
                                                    {user.provider || '-'}
                                                </span>
                                            </td>
                                            <td>
                                                <span
                                                    className={`${styles.statusBadge} ${
                                                        user.status === 'active'
                                                            ? styles.statusActive
                                                            : styles.statusInactive
                                                    }`}
                                                >
                                                    {user.status || '-'}
                                                </span>
                                            </td>
                                            <td>
                                                {user.last_activity
                                                    ? formatDateTime(user.last_activity)
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {searchTotal > 0 && (
                        <div className={styles.pagination}>
                            <button
                                type="button"
                                className={styles.pageButton}
                                onClick={() => {
                                    const prev = Math.max(1, searchPage - 1);
                                    setSearchPage(prev);
                                    fetchSearchResults(prev);
                                }}
                                disabled={searchPage === 1}
                                aria-label="이전 페이지"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span className={styles.pageInfo}>
                                {searchPage} / {searchTotalPages}
                            </span>
                            <button
                                type="button"
                                className={styles.pageButton}
                                onClick={() => {
                                    const next = Math.min(searchTotalPages, searchPage + 1);
                                    setSearchPage(next);
                                    fetchSearchResults(next);
                                }}
                                disabled={searchPage === searchTotalPages}
                                aria-label="다음 페이지"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
