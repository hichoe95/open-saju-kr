'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    FileText,
    Filter,
    X,
} from 'lucide-react';
import { AuditLog, getAuditLogs } from '@/lib/adminApi';
import styles from './page.module.css';

const ACTION_OPTIONS = [
    { value: '', label: '전체 액션' },
    { value: 'balance.adjust', label: 'balance.adjust' },
    { value: 'alert.check', label: 'alert.check' },
    { value: 'alert.test', label: 'alert.test' },
    { value: 'alert.daily_report', label: 'alert.daily_report' },
    { value: 'analytics.aggregate', label: 'analytics.aggregate' },
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

function formatTarget(log: AuditLog): string {
    if (!log.target_type && !log.target_id) return '-';
    if (log.target_type && log.target_id) return `${log.target_type}/${shortId(log.target_id)}`;
    return log.target_type || shortId(log.target_id);
}

function formatJsonPreview(value: unknown): string {
    if (value === null || value === undefined) return '-';

    const json = JSON.stringify(value);
    if (!json) return '-';

    return json.length > 52 ? `${json.slice(0, 52)}...` : json;
}

function formatJson(value: unknown): string {
    if (value === null || value === undefined) return '(없음)';
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export default function AdminAuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [actionFilter, setActionFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

    const LIMIT = 20;
    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const data = await getAuditLogs(
                page,
                LIMIT,
                actionFilter || undefined,
                startDate || undefined,
                endDate || undefined
            );
            setLogs(data.logs);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : '감사 로그를 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, [actionFilter, endDate, page, startDate]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleFilterChange = () => {
        setPage(1);
    };

    const handleLogClick = (logId: string) => {
        setSelectedLogId((prev) => (prev === logId ? null : logId));
    };

    if (isLoading && logs.length === 0) {
        return (
            <div className={styles.container} data-testid="admin-audit-page">
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>감사 로그 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container} data-testid="admin-audit-page">
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{error}</p>
                    <button type="button" onClick={fetchLogs} className={styles.retryButton}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} data-testid="admin-audit-page">
            <header className={styles.header}>
                <div>
                <h1 className={styles.title} data-testid="admin-audit-ready">
                        <FileText size={28} />
                        감사 로그
                    </h1>
                    <p className={styles.subtitle}>전체 {total.toLocaleString()}건</p>
                </div>
            </header>

            <div className={styles.filtersSection}>
                <div className={styles.filterGroup}>
                    <Filter size={16} className={styles.filterIcon} />
                    <select
                        value={actionFilter}
                        onChange={(e) => {
                            setActionFilter(e.target.value);
                            handleFilterChange();
                        }}
                        className={styles.filterSelect}
                        aria-label="액션 필터"
                    >
                        {ACTION_OPTIONS.map((option) => (
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
                            handleFilterChange();
                        }}
                        className={styles.dateInput}
                        aria-label="시작일"
                    />

                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                            setEndDate(e.target.value);
                            handleFilterChange();
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
                                setPage(1);
                            }}
                        >
                            날짜 초기화
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>시간</th>
                            <th>관리자</th>
                            <th>액션</th>
                            <th>대상</th>
                            <th>Before</th>
                            <th>After</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={styles.emptyCell}>
                                    표시할 감사 로그가 없습니다
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <React.Fragment key={log.id}>
                                    <tr
                                        className={`${styles.logRow} ${
                                            selectedLogId === log.id ? styles.selected : ''
                                        }`}
                                        onClick={() => handleLogClick(log.id)}
                                    >
                                        <td>{formatDateTime(log.created_at)}</td>
                                        <td className={styles.adminId}>
                                            <code>{shortId(log.admin_id)}</code>
                                        </td>
                                        <td>
                                            <span className={styles.actionBadge}>{log.action}</span>
                                        </td>
                                        <td className={styles.target}>{formatTarget(log)}</td>
                                        <td className={styles.dataPreview}>{formatJsonPreview(log.before_data)}</td>
                                        <td className={styles.dataPreview}>{formatJsonPreview(log.after_data)}</td>
                                    </tr>

                                    {selectedLogId === log.id && (
                                        <tr className={styles.detailRow}>
                                            <td colSpan={6}>
                                                <div className={styles.detailPanel}>
                                                    <button
                                                        type="button"
                                                        className={styles.closeDetail}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedLogId(null);
                                                        }}
                                                        aria-label="상세 닫기"
                                                    >
                                                        <X size={18} />
                                                    </button>

                                                    <div className={styles.detailMeta}>
                                                        <span>사유: {log.reason || '-'}</span>
                                                        <span>대상: {formatTarget(log)}</span>
                                                    </div>

                                                    <div className={styles.diffGrid}>
                                                        <section className={styles.diffSection}>
                                                            <h3>Before</h3>
                                                            <pre className={`${styles.codeBlock} ${styles.beforeBlock}`}>
                                                                {formatJson(log.before_data)}
                                                            </pre>
                                                        </section>
                                                        <section className={styles.diffSection}>
                                                            <h3>After</h3>
                                                            <pre className={`${styles.codeBlock} ${styles.afterBlock}`}>
                                                                {formatJson(log.after_data)}
                                                            </pre>
                                                        </section>
                                                    </div>

                                                    <section className={styles.metaSection}>
                                                        <h3>Metadata</h3>
                                                        <pre className={styles.codeBlock}>{formatJson(log.metadata)}</pre>
                                                    </section>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className={styles.pagination}>
                <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    aria-label="이전 페이지"
                >
                    <ChevronLeft size={18} />
                </button>
                <span className={styles.pageInfo}>
                    {page} / {totalPages}
                </span>
                <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                    aria-label="다음 페이지"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
}
