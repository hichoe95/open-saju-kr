'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    Filter,
    AlertCircle,
    Bug,
    Lightbulb,
    HelpCircle,
    MessageCircle,
    CreditCard,
    UserCog,
    ChevronLeft,
    ChevronRight,
    Check,
    Clock,
    CheckCircle,
    Send,
    Download,
} from 'lucide-react';
import { getFeedbacks, updateFeedback, Feedback } from '@/lib/adminApi';
import styles from './page.module.css';

const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    pending: { label: '대기', icon: <Clock size={14} />, color: '#F59E0B' },
    reviewed: { label: '검토됨', icon: <Check size={14} />, color: '#3B82F6' },
    resolved: { label: '해결됨', icon: <CheckCircle size={14} />, color: '#10B981' },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    bug: { label: '버그', icon: <Bug size={14} />, color: '#EF4444' },
    feature: { label: '기능 제안', icon: <Lightbulb size={14} />, color: '#8B5CF6' },
    other: { label: '기타', icon: <MessageCircle size={14} />, color: '#6B7280' },
    payment: { label: '결제 문제', icon: <CreditCard size={14} />, color: '#F97316' },
    account: { label: '계정 문제', icon: <UserCog size={14} />, color: '#06B6D4' },
    inquiry: { label: '일반 문의', icon: <HelpCircle size={14} />, color: '#8B5CF6' },
};

export default function AdminFeedbacksPage() {
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [adminNote, setAdminNote] = useState('');
    const [adminResponse, setAdminResponse] = useState('');
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const LIMIT = 20;
    const totalPages = Math.ceil(total / LIMIT);

    const fetchFeedbacks = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getFeedbacks(
                page,
                LIMIT,
                filterStatus || undefined,
                filterCategory || undefined
            );
            setFeedbacks(data.feedbacks);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : '피드백을 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, [page, filterStatus, filterCategory]);

    useEffect(() => {
        fetchFeedbacks();
    }, [fetchFeedbacks]);

    const handleStatusChange = async (feedbackId: string, newStatus: string) => {
        setUpdatingId(feedbackId);
        try {
            await updateFeedback(feedbackId, newStatus, adminNote || undefined, adminResponse || undefined);
            setFeedbacks((prev) =>
                prev.map((f) =>
                    f.id === feedbackId
                        ? {
                            ...f,
                            status: newStatus as Feedback['status'],
                            admin_note: adminNote || f.admin_note,
                            response: adminResponse || f.response,
                            responded_at: adminResponse ? new Date().toISOString() : f.responded_at,
                        }
                        : f
                )
            );
            setAdminNote('');
            setAdminResponse('');
        } catch (err) {
            console.error('Failed to update feedback:', err);
        } finally {
            setUpdatingId(null);
        }
    };

    const handleExpand = (feedbackId: string) => {
        if (expandedId === feedbackId) {
            setExpandedId(null);
            setAdminNote('');
        } else {
            setExpandedId(feedbackId);
            const feedback = feedbacks.find((f) => f.id === feedbackId);
            setAdminNote(feedback?.admin_note || '');
            setAdminResponse(feedback?.response || '');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const exportToCSV = () => {
        const headers = ['사용자 ID', '카테고리', '내용', '상태', '관리자 답변', '관리자 메모', '작성일'];
        const rows = feedbacks.map(feedback => [
            feedback.user_id,
            CATEGORY_LABELS[feedback.category]?.label || feedback.category,
            feedback.content,
            STATUS_LABELS[feedback.status]?.label || feedback.status,
            feedback.response || '',
            feedback.admin_note || '',
            formatDate(feedback.created_at)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `feedbacks_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (isLoading && feedbacks.length === 0) {
        return (
            <div className={styles.container} data-testid="admin-feedbacks-page">
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>피드백 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container} data-testid="admin-feedbacks-page">
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{error}</p>
                    <button onClick={fetchFeedbacks} className={styles.retryButton}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} data-testid="admin-feedbacks-page">
            <header className={styles.header}>
                <div>
                <h1 className={styles.title} data-testid="admin-feedbacks-ready">
                        <MessageSquare size={28} />
                        문의/의견 관리
                    </h1>
                    <p className={styles.subtitle}>총 {total.toLocaleString()}건</p>
                </div>
                <button className={styles.exportButton} onClick={exportToCSV} aria-label="CSV 내보내기" disabled={feedbacks.length === 0}>
                    <Download size={18} />
                    CSV 내보내기
                </button>
            </header>

            <div className={styles.filters}>
                <Filter size={18} />
                <select
                    value={filterStatus}
                    onChange={(e) => {
                        setFilterStatus(e.target.value);
                        setPage(1);
                    }}
                    className={styles.filterSelect}
                >
                    <option value="">모든 상태</option>
                    <option value="pending">대기</option>
                    <option value="reviewed">검토됨</option>
                    <option value="resolved">해결됨</option>
                </select>
                <select
                    value={filterCategory}
                    onChange={(e) => {
                        setFilterCategory(e.target.value);
                        setPage(1);
                    }}
                    className={styles.filterSelect}
                >
                    <option value="">모든 카테고리</option>
                    <option value="bug">버그</option>
                    <option value="feature">기능 제안</option>
                    <option value="payment">결제 문제</option>
                    <option value="account">계정 문제</option>
                    <option value="inquiry">일반 문의</option>
                    <option value="other">기타</option>
                </select>
            </div>

            <div className={styles.feedbackList}>
                {feedbacks.length === 0 ? (
                    <div className={styles.emptyState}>
                        <MessageSquare size={48} />
                        <p>해당 조건의 피드백이 없습니다</p>
                    </div>
                ) : (
                    feedbacks.map((feedback) => {
                        const statusInfo = STATUS_LABELS[feedback.status];
                        const categoryInfo = CATEGORY_LABELS[feedback.category] || { label: feedback.category, icon: <HelpCircle size={14} />, color: '#6B7280' };
                        const isExpanded = expandedId === feedback.id;

                        return (
                            <div
                                key={feedback.id}
                                className={`${styles.feedbackCard} ${isExpanded ? styles.expanded : ''}`}
                            >
                                <div
                                    className={styles.feedbackHeader}
                                    onClick={() => handleExpand(feedback.id)}
                                >
                                    <div className={styles.feedbackMeta}>
                                        <span
                                            className={styles.categoryBadge}
                                            style={{
                                                backgroundColor: `${categoryInfo.color}15`,
                                                color: categoryInfo.color,
                                            }}
                                        >
                                            {categoryInfo.icon}
                                            {categoryInfo.label}
                                        </span>
                                        <span
                                            className={styles.statusBadge}
                                            style={{
                                                backgroundColor: `${statusInfo.color}15`,
                                                color: statusInfo.color,
                                            }}
                                        >
                                            {statusInfo.icon}
                                            {statusInfo.label}
                                        </span>
                                    </div>
                                    <span className={styles.feedbackDate}>
                                        {formatDate(feedback.created_at)}
                                    </span>
                                </div>

                                <div className={styles.feedbackContent}>
                                    <p>{feedback.content}</p>
                                </div>

                                <div className={styles.feedbackFooter}>
                                    <span className={styles.userId}>
                                        사용자: {feedback.user_id.slice(0, 8)}...
                                    </span>
                                </div>

                                {isExpanded && (
                                    <div className={styles.feedbackActions}>
                                        <div className={styles.noteSection}>
                                            <label>사용자 답변</label>
                                            <textarea
                                                value={adminResponse}
                                                onChange={(e) => setAdminResponse(e.target.value)}
                                                placeholder="사용자에게 보낼 답변을 작성하세요..."
                                                rows={3}
                                            />
                                            <p className={styles.noteHint}>
                                                <Send size={12} />
                                                이 답변은 사용자의 문의 내역에 표시됩니다
                                            </p>
                                        </div>

                                        <div className={styles.noteSection}>
                                            <label>관리자 메모 (내부용)</label>
                                            <textarea
                                                value={adminNote}
                                                onChange={(e) => setAdminNote(e.target.value)}
                                                placeholder="내부 메모를 입력하세요..."
                                                rows={2}
                                            />
                                        </div>

                                        <div className={styles.statusActions}>
                                            <span>상태 변경:</span>
                                            {(['pending', 'reviewed', 'resolved'] as const).map((status) => (
                                                <button
                                                    key={status}
                                                    className={`${styles.statusButton} ${
                                                        feedback.status === status ? styles.active : ''
                                                    }`}
                                                    style={{
                                                        borderColor: STATUS_LABELS[status].color,
                                                        color:
                                                            feedback.status === status
                                                                ? 'white'
                                                                : STATUS_LABELS[status].color,
                                                        backgroundColor:
                                                            feedback.status === status
                                                                ? STATUS_LABELS[status].color
                                                                : 'transparent',
                                                    }}
                                                    onClick={() => handleStatusChange(feedback.id, status)}
                                                    disabled={updatingId === feedback.id}
                                                >
                                                    {updatingId === feedback.id ? (
                                                        <div className={styles.buttonSpinner} />
                                                    ) : (
                                                        <>
                                                            {STATUS_LABELS[status].icon}
                                                            {STATUS_LABELS[status].label}
                                                        </>
                                                    )}
                                                </button>
                                            ))}
                                        </div>

                                        {feedback.response && (
                                            <div className={styles.existingNote}>
                                                <strong>기존 답변:</strong> {feedback.response}
                                                {feedback.responded_at && (
                                                    <span className={styles.respondedAt}>
                                                        ({formatDate(feedback.responded_at)})
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {feedback.admin_note && (
                                            <div className={styles.existingNote}>
                                                <strong>기존 메모:</strong> {feedback.admin_note}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        className={styles.pageButton}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        aria-label="이전 페이지"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className={styles.pageInfo}>
                        {page} / {totalPages}
                    </span>
                    <button
                        className={styles.pageButton}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        aria-label="다음 페이지"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}
