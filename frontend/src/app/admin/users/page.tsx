'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Users,
    Search,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    User,
    Wallet,
    History,
    FileText,
    X,
    Plus,
    Minus,
    Shield,
    Filter,
    Download,
} from 'lucide-react';
import {
    getUsers,
    getUserDetail,
    adjustUserBalance,
    updateUserStatus,
    AdminUser,
    UserDetailResponse,
    UserFilters,
} from '@/lib/adminApi';
import styles from './page.module.css';

const PROVIDER_LABELS: Record<string, string> = {
    kakao: '카카오',
    naver: '네이버',
    email: '이메일',
};

const PROVIDER_COLORS: Record<string, string> = {
    kakao: '#FEE500',
    naver: '#03C75A',
    email: '#6B7280',
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [providerFilter, setProviderFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [userDetail, setUserDetail] = useState<UserDetailResponse | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    
    const [adjustAmount, setAdjustAmount] = useState('');
    const [adjustReason, setAdjustReason] = useState('');
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);
    const adjustIdempotencyKeyRef = useRef<string | null>(null);

    const LIMIT = 20;
    const totalPages = Math.ceil(total / LIMIT);

    const filters: UserFilters = useMemo(() => ({
        search: searchQuery || undefined,
        provider: providerFilter || undefined,
        adminOnly: statusFilter === 'admin' ? true : undefined,
    }), [searchQuery, providerFilter, statusFilter]);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getUsers(page, LIMIT, filters);
            setUsers(data.users);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : '사용자 목록을 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, [page, filters]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchUsers();
    };

    const handleFilterChange = () => {
        setPage(1);
    };

    const handleUserClick = async (userId: string) => {
        if (selectedUserId === userId) {
            setSelectedUserId(null);
            setUserDetail(null);
            return;
        }

        setSelectedUserId(userId);
        setIsLoadingDetail(true);
        setAdjustSuccess(null);
        setAdjustAmount('');
        setAdjustReason('');
        adjustIdempotencyKeyRef.current = null;

        try {
            const detail = await getUserDetail(userId);
            setUserDetail(detail);
        } catch (err) {
            setAdjustSuccess(err instanceof Error ? `실패: ${err.message}` : '사용자 상세 조회 실패');
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleAdjustBalance = async () => {
        if (!selectedUserId || !adjustAmount || !adjustReason) return;

        const amount = parseInt(adjustAmount, 10);
        if (Number.isNaN(amount) || amount === 0 || amount < -10000 || amount > 10000) {
            setAdjustSuccess('실패: 조정 금액은 -10000 ~ 10000 범위의 0이 아닌 정수여야 합니다');
            return;
        }

        const reason = adjustReason.trim();
        if (!reason) {
            setAdjustSuccess('실패: 조정 사유를 입력해주세요');
            return;
        }

        if (!adjustIdempotencyKeyRef.current) {
            adjustIdempotencyKeyRef.current = crypto.randomUUID();
        }
        const idempotencyKey = adjustIdempotencyKeyRef.current;

        setIsAdjusting(true);
        setAdjustSuccess(null);

        try {
            const result = await adjustUserBalance(
                selectedUserId,
                amount,
                reason,
                idempotencyKey
            );
            setAdjustSuccess(
                `잔액 조정 완료: ${result.previous_balance} → ${result.new_balance} 엽전`
            );
            setAdjustAmount('');
            setAdjustReason('');
            adjustIdempotencyKeyRef.current = null;

            const detail = await getUserDetail(selectedUserId);
            setUserDetail(detail);
            fetchUsers();
        } catch (err) {
            setAdjustSuccess(err instanceof Error ? `실패: ${err.message}` : '조정 실패');
        } finally {
            setIsAdjusting(false);
        }
    };

    const handleToggleUserStatus = async () => {
        if (!selectedUserId || !userDetail?.user) return;

        const currentStatus: 'active' | 'banned' =
            userDetail.user.status === 'banned' ? 'banned' : 'active';
        const nextStatus: 'active' | 'banned' =
            currentStatus === 'active' ? 'banned' : 'active';

        if (nextStatus === 'banned') {
            const confirmed = window.confirm('이 사용자를 정지하시겠습니까?');
            if (!confirmed) return;

            const reasonInput = window.prompt('정지 사유를 입력하세요:');
            const reason = reasonInput?.trim();
            if (!reason) return;

            setIsUpdatingStatus(true);
            setAdjustSuccess(null);
            try {
                await updateUserStatus(selectedUserId, nextStatus, reason);
                const detail = await getUserDetail(selectedUserId);
                setUserDetail(detail);
                await fetchUsers();
                setAdjustSuccess('사용자 상태가 정지됨으로 변경되었습니다');
            } catch (err) {
                setAdjustSuccess(err instanceof Error ? `실패: ${err.message}` : '상태 변경 실패');
            } finally {
                setIsUpdatingStatus(false);
            }
            return;
        }

        const confirmed = window.confirm('이 사용자의 정지를 해제하시겠습니까?');
        if (!confirmed) return;

        setIsUpdatingStatus(true);
        setAdjustSuccess(null);
        try {
            await updateUserStatus(selectedUserId, nextStatus, '관리자 정지 해제');
            const detail = await getUserDetail(selectedUserId);
            setUserDetail(detail);
            await fetchUsers();
            setAdjustSuccess('사용자 상태가 활성으로 변경되었습니다');
        } catch (err) {
            setAdjustSuccess(err instanceof Error ? `실패: ${err.message}` : '상태 변경 실패');
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const currentUserStatus: 'active' | 'banned' =
        userDetail?.user.status === 'banned' ? 'banned' : 'active';

    const exportToCSV = () => {
        const headers = ['ID', '이름', '이메일', '가입일', '로그인', '잔액', '관리자'];
        const rows = users.map(user => [
            user.id,
            user.name || '',
            user.email || '',
            formatDate(user.created_at),
            PROVIDER_LABELS[user.provider] || user.provider,
            user.balance,
            user.is_admin ? 'Y' : 'N'
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `users_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (isLoading && users.length === 0) {
        return (
            <div className={styles.container} data-testid="admin-users-page">
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>사용자 목록 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container} data-testid="admin-users-page">
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{error}</p>
                    <button type="button" onClick={fetchUsers} className={styles.retryButton}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} data-testid="admin-users-page">
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title} data-testid="admin-users-ready">
                        <Users size={28} />
                        사용자 관리
                    </h1>
                    <p className={styles.subtitle}>전체 {total.toLocaleString()}명의 사용자</p>
                </div>
                <button 
                    type="button"
                    className={styles.exportButton}
                    onClick={exportToCSV}
                    disabled={users.length === 0}
                >
                    <Download size={18} />
                    CSV 내보내기
                </button>
            </header>

            <div className={styles.filtersSection}>
                <form onSubmit={handleSearch} className={styles.searchForm}>
                    <div className={styles.searchInputWrapper}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="사용자 ID로 검색..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.clearButton}
                                onClick={() => {
                                    setSearchQuery('');
                                    setPage(1);
                                }}
                                aria-label="검색어 지우기"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </form>
                
                <div className={styles.filterGroup}>
                    <Filter size={16} className={styles.filterIcon} />
                    <select
                        value={providerFilter}
                        onChange={(e) => {
                            setProviderFilter(e.target.value);
                            handleFilterChange();
                        }}
                        className={styles.filterSelect}
                        aria-label="로그인 방식 필터"
                    >
                        <option value="">전체 로그인</option>
                        <option value="kakao">카카오</option>
                        <option value="naver">네이버</option>
                    </select>
                    
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            handleFilterChange();
                        }}
                        className={styles.filterSelect}
                        aria-label="상태 필터"
                    >
                        <option value="">전체 상태</option>
                        <option value="active">활성 사용자</option>
                        <option value="admin">관리자만</option>
                    </select>
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>이름</th>
                            <th>이메일</th>
                            <th>가입일</th>
                            <th>로그인</th>
                            <th>잔액</th>
                            <th>권한</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <React.Fragment key={user.id}>
                                <tr
                                    className={`${styles.userRow} ${
                                        selectedUserId === user.id ? styles.selected : ''
                                    }`}
                                    onClick={() => handleUserClick(user.id)}
                                >
                                    <td className={styles.userId}>
                                        <code>{user.id.slice(0, 8)}...</code>
                                    </td>
                                    <td className={styles.userName}>
                                        {user.name || '-'}
                                    </td>
                                    <td className={styles.userEmail}>
                                        {user.email || '-'}
                                    </td>
                                    <td>{formatDate(user.created_at)}</td>
                                    <td>
                                        <span
                                            className={styles.providerBadge}
                                            style={{
                                                backgroundColor: `${PROVIDER_COLORS[user.provider]}20`,
                                                color: PROVIDER_COLORS[user.provider],
                                            }}
                                        >
                                            {PROVIDER_LABELS[user.provider] || user.provider}
                                        </span>
                                    </td>
                                    <td className={styles.balance}>
                                        {user.balance.toLocaleString()} 엽전
                                    </td>
                                    <td>
                                        {user.is_admin && (
                                            <span className={styles.adminBadge}>
                                                <Shield size={12} />
                                                관리자
                                            </span>
                                        )}
                                    </td>
                                </tr>
                                {selectedUserId === user.id && (
                                    <tr className={styles.detailRow}>
                                        <td colSpan={7}>
                                            <div className={styles.detailPanel}>
                                                <button
                                                    type="button"
                                                    className={styles.closeDetail}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedUserId(null);
                                                    }}
                                                    aria-label="닫기"
                                                >
                                                    <X size={20} />
                                                </button>

                                                {isLoadingDetail ? (
                                                    <div className={styles.detailLoading}>
                                                        <div className={styles.spinner} />
                                                    </div>
                                                ) : userDetail ? (
                                                    <div className={styles.detailContent}>
                                                        <div className={styles.detailSection}>
                                                            <h3>
                                                                <User size={16} />
                                                                사용자 정보
                                                            </h3>
                                                            <div className={styles.infoGrid}>
                                                                <div>
                                                                    <span className={styles.infoLabel}>ID</span>
                                                                    <span className={styles.infoValue}>
                                                                        {userDetail.user.id}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className={styles.infoLabel}>이름</span>
                                                                    <span className={styles.infoValue}>
                                                                        {userDetail.user.name || '-'}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className={styles.infoLabel}>이메일</span>
                                                                    <span className={styles.infoValue}>
                                                                        {userDetail.user.email || '-'}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className={styles.infoLabel}>상태</span>
                                                                    <span
                                                                        className={`${styles.statusBadge} ${
                                                                            currentUserStatus === 'banned'
                                                                                ? styles.statusBanned
                                                                                : styles.statusActive
                                                                        }`}
                                                                    >
                                                                        {currentUserStatus === 'banned' ? '정지됨' : '활성'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className={styles.statusAction}>
                                                                <button
                                                                    type="button"
                                                                    className={`${styles.statusActionButton} ${
                                                                        currentUserStatus === 'banned'
                                                                            ? styles.activateButton
                                                                            : styles.banButton
                                                                    }`}
                                                                    onClick={handleToggleUserStatus}
                                                                    disabled={isUpdatingStatus}
                                                                >
                                                                    {isUpdatingStatus
                                                                        ? '처리 중...'
                                                                        : currentUserStatus === 'banned'
                                                                          ? '정지 해제'
                                                                          : '사용자 정지'}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className={styles.detailSection}>
                                                            <h3>
                                                                <Wallet size={16} />
                                                                지갑 정보
                                                            </h3>
                                                            <div className={styles.walletStats}>
                                                                <div className={styles.walletStat}>
                                                                    <span>현재 잔액</span>
                                                                    <strong>
                                                                        {userDetail.wallet.balance.toLocaleString()}
                                                                    </strong>
                                                                </div>
                                                                <div className={styles.walletStat}>
                                                                    <span>총 충전</span>
                                                                    <strong>
                                                                        {userDetail.wallet.total_charged.toLocaleString()}
                                                                    </strong>
                                                                </div>
                                                                <div className={styles.walletStat}>
                                                                    <span>총 사용</span>
                                                                    <strong>
                                                                        {userDetail.wallet.total_spent.toLocaleString()}
                                                                    </strong>
                                                                </div>
                                                            </div>

                                                            <div className={styles.adjustForm}>
                                                                <h4>잔액 조정</h4>
                                                                <div className={styles.adjustInputs}>
                                                                    <div className={styles.amountInput}>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.amountBtn}
                                                                            onClick={() =>
                                                                                setAdjustAmount((prev) => {
                                                                                    adjustIdempotencyKeyRef.current = null;
                                                                                    return String(
                                                                                        Math.max(
                                                                                            (parseInt(prev, 10) || 0) - 100,
                                                                                            -10000
                                                                                        )
                                                                                    );
                                                                                })
                                                                            }
                                                                        >
                                                                            <Minus size={16} />
                                                                        </button>
                                                                        <input
                                                                            type="number"
                                                                            placeholder="조정 금액"
                                                                            value={adjustAmount}
                                                                            onChange={(e) =>
                                                                                {
                                                                                    adjustIdempotencyKeyRef.current = null;
                                                                                    setAdjustAmount(e.target.value);
                                                                                }
                                                                            }
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            className={styles.amountBtn}
                                                                            onClick={() =>
                                                                                setAdjustAmount((prev) => {
                                                                                    adjustIdempotencyKeyRef.current = null;
                                                                                    return String((parseInt(prev, 10) || 0) + 100);
                                                                                })
                                                                            }
                                                                        >
                                                                            <Plus size={16} />
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="조정 사유"
                                                                        value={adjustReason}
                                                                        onChange={(e) =>
                                                                            {
                                                                                adjustIdempotencyKeyRef.current = null;
                                                                                setAdjustReason(e.target.value);
                                                                            }
                                                                        }
                                                                        className={styles.reasonInput}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        className={styles.adjustButton}
                                                                        onClick={handleAdjustBalance}
                                                                        disabled={
                                                                            isAdjusting ||
                                                                            !adjustAmount ||
                                                                            !adjustReason
                                                                        }
                                                                    >
                                                                        {isAdjusting ? '처리 중...' : '조정'}
                                                                    </button>
                                                                </div>
                                                                {adjustSuccess && (
                                                                    <p
                                                                        className={`${styles.adjustResult} ${
                                                                            adjustSuccess.includes('실패')
                                                                                ? styles.error
                                                                                : styles.success
                                                                        }`}
                                                                    >
                                                                        {adjustSuccess}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className={styles.detailSection}>
                                                            <h3>
                                                                <History size={16} />
                                                                최근 거래 ({userDetail.transactions.length})
                                                            </h3>
                                                            {userDetail.transactions.length === 0 ? (
                                                                <p className={styles.emptyText}>거래 내역 없음</p>
                                                            ) : (
                                                                <div className={styles.transactionList}>
                                                                    {userDetail.transactions.slice(0, 5).map((tx) => (
                                                                        <div
                                                                            key={tx.id}
                                                                            className={styles.transactionItem}
                                                                        >
                                                                            <div>
                                                                                <span className={styles.txType}>
                                                                                    {tx.type}
                                                                                </span>
                                                                                <span className={styles.txDesc}>
                                                                                    {tx.description}
                                                                                </span>
                                                                            </div>
                                                                            <div>
                                                                                <span
                                                                                    className={`${styles.txAmount} ${
                                                                                        tx.amount > 0
                                                                                            ? styles.positive
                                                                                            : styles.negative
                                                                                    }`}
                                                                                >
                                                                                    {tx.amount > 0 ? '+' : ''}
                                                                                    {tx.amount}
                                                                                </span>
                                                                                <span className={styles.txDate}>
                                                                                    {formatDateTime(tx.created_at)}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className={styles.detailSection}>
                                                            <h3>
                                                                <FileText size={16} />
                                                                분석 기록 ({userDetail.readings.length})
                                                            </h3>
                                                            {userDetail.readings.length === 0 ? (
                                                                <p className={styles.emptyText}>분석 기록 없음</p>
                                                            ) : (
                                                                <div className={styles.readingList}>
                                                                    {userDetail.readings.slice(0, 5).map((reading) => (
                                                                        <div
                                                                            key={reading.id}
                                                                            className={styles.readingItem}
                                                                        >
                                                                            <span>{reading.birth_date}</span>
                                                                            <span className={styles.readingModel}>
                                                                                {reading.model_used}
                                                                            </span>
                                                                            <span className={styles.readingDate}>
                                                                                {formatDateTime(reading.created_at)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.pagination}>
                <button
                    type="button"
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
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="다음 페이지"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
}
