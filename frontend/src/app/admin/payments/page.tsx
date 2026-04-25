'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    CreditCard,
    AlertCircle,
    RefreshCw,
    AlertTriangle,
    Coins,
    ArrowRightLeft,
    Check,
    Download,
} from 'lucide-react';
import { getPaymentIssues, processRefund, FailedPayment, RefundInfo } from '@/lib/adminApi';
import styles from './page.module.css';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AdminPaymentsPage() {
    const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);
    const [totalFailed, setTotalFailed] = useState(0);
    const [recentRefunds, setRecentRefunds] = useState<RefundInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [refundUserId, setRefundUserId] = useState('');
    const [refundOriginalTxId, setRefundOriginalTxId] = useState('');
    const [refundAmount, setRefundAmount] = useState('');
    const [refundReason, setRefundReason] = useState('');
    const [isRefunding, setIsRefunding] = useState(false);
    const [refundResult, setRefundResult] = useState<{ success: boolean; message: string } | null>(null);

    const fetchPaymentIssues = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getPaymentIssues();
            setFailedPayments(data.failed_payments);
            setTotalFailed(data.total_failed);
            setRecentRefunds(data.recent_refunds);
        } catch (err) {
            setError(err instanceof Error ? err.message : '결제 정보를 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPaymentIssues();
    }, [fetchPaymentIssues]);

    const handleRefund = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!refundUserId || !refundOriginalTxId || !refundAmount || !refundReason) return;

        const userId = refundUserId.trim();
        const originalTxId = refundOriginalTxId.trim();
        const reason = refundReason.trim();
        const amount = parseInt(refundAmount, 10);

        if (!UUID_PATTERN.test(userId)) {
            setRefundResult({ success: false, message: '사용자 ID는 UUID 형식이어야 합니다' });
            return;
        }

        if (!UUID_PATTERN.test(originalTxId)) {
            setRefundResult({ success: false, message: '원본 거래 ID는 UUID 형식이어야 합니다' });
            return;
        }

        if (Number.isNaN(amount) || amount <= 0) {
            setRefundResult({ success: false, message: '환불 금액은 0보다 커야 합니다' });
            return;
        }

        if (!reason) {
            setRefundResult({ success: false, message: '환불 사유를 입력해주세요' });
            return;
        }

        const confirmed = window.confirm(`정말 ${amount.toLocaleString()} 엽전을 환불하시겠습니까?`);
        if (!confirmed) return;

        const idempotencyKey = `admin_refund:${originalTxId}`;

        setIsRefunding(true);
        setRefundResult(null);

        try {
            const result = await processRefund(userId, amount, reason, originalTxId, idempotencyKey);
            setRefundResult({
                success: true,
                message: `환불 완료: ${result.amount} 엽전 → 새 잔액: ${result.new_balance} 엽전`,
            });
            setRefundUserId('');
            setRefundOriginalTxId('');
            setRefundAmount('');
            setRefundReason('');
            fetchPaymentIssues();
        } catch (err) {
            setRefundResult({
                success: false,
                message: err instanceof Error ? err.message : '환불 처리 실패',
            });
        } finally {
            setIsRefunding(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const exportToCSV = () => {
        const headers = ['사용자 ID', '금액', '에러 코드', '에러 메시지', '일시'];
        const maskUserId = (value: string) => value.length <= 8 ? value : `${value.slice(0, 8)}...`;
        const sanitizeFailureMessage = (value: string | null) => {
            if (!value) return '';
            return value.replace(/[\r\n]+/g, ' ').slice(0, 120);
        };
        const rows = failedPayments.map(payment => [
            maskUserId(payment.user_id),
            payment.amount,
            payment.failure_code || '',
            sanitizeFailureMessage(payment.failure_message),
            formatDate(payment.created_at)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return (
            <div className={styles.container} data-testid="admin-payments-page">
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>결제 정보 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container} data-testid="admin-payments-page">
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{error}</p>
                    <button type="button" onClick={fetchPaymentIssues} className={styles.retryButton}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} data-testid="admin-payments-page">
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title} data-testid="admin-payments-ready">
                        <CreditCard size={28} />
                        결제 관리
                    </h1>
                    <p className={styles.subtitle}>결제 이슈 및 환불 처리</p>
                </div>
                <div className={styles.headerButtons}>
                    <button type="button" className={styles.refreshButton} onClick={exportToCSV} aria-label="CSV 내보내기" disabled={failedPayments.length === 0}>
                        <Download size={18} />
                        CSV 내보내기
                    </button>
                    <button type="button" className={styles.refreshButton} onClick={fetchPaymentIssues} aria-label="새로고침">
                        <RefreshCw size={18} />
                        새로고침
                    </button>
                </div>
            </header>

            <div className={styles.grid}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2>
                            <AlertTriangle size={20} />
                            실패한 결제
                            <span className={styles.badge}>{totalFailed}</span>
                        </h2>
                    </div>

                    {failedPayments.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Check size={40} />
                            <p>실패한 결제가 없습니다</p>
                        </div>
                    ) : (
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>사용자 ID</th>
                                        <th>금액</th>
                                        <th>에러</th>
                                        <th>일시</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {failedPayments.map((payment) => (
                                        <tr key={payment.id}>
                                            <td className={styles.userId}>
                                                <code>{payment.user_id.slice(0, 8)}...</code>
                                            </td>
                                            <td className={styles.amount}>
                                                {payment.amount.toLocaleString()}원
                                            </td>
                                            <td>
                                                <span className={styles.errorCode}>
                                                    {payment.failure_code || '-'}
                                                </span>
                                                <span className={styles.errorMessage}>
                                                    {payment.failure_message || '알 수 없는 오류'}
                                                </span>
                                            </td>
                                            <td className={styles.date}>
                                                {formatDate(payment.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2>
                            <ArrowRightLeft size={20} />
                            수동 환불 처리
                        </h2>
                    </div>

                    <form onSubmit={handleRefund} className={styles.refundForm}>
                        <div className={styles.formGroup}>
                            <label htmlFor="refund-user-id">사용자 ID</label>
                            <input
                                id="refund-user-id"
                                type="text"
                                value={refundUserId}
                                onChange={(e) => {
                                    setRefundUserId(e.target.value);
                                }}
                                placeholder="전체 UUID 입력"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="refund-original-tx">원본 거래 ID</label>
                            <input
                                id="refund-original-tx"
                                type="text"
                                value={refundOriginalTxId}
                                onChange={(e) => {
                                    setRefundOriginalTxId(e.target.value);
                                }}
                                placeholder="환불 대상 거래 UUID"
                            />
                        </div>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label htmlFor="refund-amount">환불 금액 (엽전)</label>
                                <input
                                    id="refund-amount"
                                    type="number"
                                    value={refundAmount}
                                    onChange={(e) => {
                                        setRefundAmount(e.target.value);
                                    }}
                                    placeholder="0"
                                    min="1"
                                />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="refund-reason">환불 사유</label>
                            <textarea
                                id="refund-reason"
                                value={refundReason}
                                onChange={(e) => {
                                    setRefundReason(e.target.value);
                                }}
                                placeholder="환불 사유를 입력하세요..."
                                rows={3}
                            />
                        </div>
                        <button
                            type="submit"
                            className={styles.refundButton}
                            disabled={isRefunding || !refundUserId || !refundOriginalTxId || !refundAmount || !refundReason}
                        >
                            {isRefunding ? (
                                <>
                                    <div className={styles.buttonSpinner} />
                                    처리 중...
                                </>
                            ) : (
                                <>
                                    <Coins size={18} />
                                    환불 처리
                                </>
                            )}
                        </button>

                        {refundResult && (
                            <div
                                className={`${styles.resultMessage} ${
                                    refundResult.success ? styles.success : styles.error
                                }`}
                            >
                                {refundResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
                                {refundResult.message}
                            </div>
                        )}
                    </form>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2>
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
                        <div className={styles.refundList}>
                            {recentRefunds.map((refund) => (
                                <div key={`${refund.user_id}-${refund.created_at}-${refund.amount}-${refund.reason}`} className={styles.refundItem}>
                                    <div className={styles.refundInfo}>
                                        <span className={styles.refundUserId}>
                                            {refund.user_id.slice(0, 8)}...
                                        </span>
                                        <span className={styles.refundReason}>{refund.reason}</span>
                                    </div>
                                    <div className={styles.refundMeta}>
                                        <span className={styles.refundAmount}>
                                            {refund.amount.toLocaleString()} 엽전
                                        </span>
                                        <span className={styles.refundDate}>
                                            {formatDate(refund.created_at)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
