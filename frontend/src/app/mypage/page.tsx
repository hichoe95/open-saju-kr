'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, LogOut, User as UserIcon, ChevronRight, Star, Palette, Coins, Plus, Info, Sparkles, FileText, Shield, MessageSquarePlus, Settings, History, AlertTriangle, GitCompare, Loader2, RotateCcw, Gift, Minus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { usePayment } from '@/contexts/PaymentContext';
import WithdrawModal from '@/components/WithdrawModal';
import FeedbackModal from '@/components/FeedbackModal';
import ComparisonView from '@/components/ComparisonView';
import { useToast, ToastContainer } from '@/components/Toast';
import { submitFeedback, FeedbackCategory, getMyFeedbacks } from '@/lib/api';
import { checkAdminStatus } from '@/lib/adminApi';
import { ThemeSelector } from '@/components/ThemeToggle';
import SavedProfilesList from '@/components/SavedProfilesList';
import ReceivedProfilesList from '@/components/ReceivedProfilesList';
import CompatibilityHistoryList from '@/components/CompatibilityHistoryList';
import CodeInputModal from '@/components/CodeInputModal';
import { SavedProfile, getProfiles, getCachedReadingByProfile, getReceivedProfiles, deleteReceivedProfile, saveReceivedProfile, ReceivedProfile } from '@/lib/api';
import { getTransactions, getWalletExpiration, WalletExpiration } from '@/lib/paymentApi';
import { Transaction } from '@/types/payment';
import { jijiToTime } from '@/utils/jijiTime';
import { ComparisonCandidate, profileToBirthInput, loadSavedProfileForComparison, receivedToCandidate } from '@/utils/profileToComparison';
import { useAnalytics } from '@/hooks/useAnalytics';
import styles from './page.module.css';

export default function MyPage() {
  const router = useRouter();
  const { user, logout, withdraw, isLoading: isAuthLoading, refreshUser, token } = useAuth();
  const { wallet, walletError } = usePayment();
  useAnalytics({ autoTrackPageView: true, pageName: 'mypage' });
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadFeedbackReplies, setUnreadFeedbackReplies] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expiration, setExpiration] = useState<WalletExpiration | null>(null);
  const hasRedirectedRef = useRef(false);
  const { toasts, showToast, removeToast } = useToast();
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [receivedProfiles, setReceivedProfiles] = useState<ReceivedProfile[]>([]);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [disabledProfileIds, setDisabledProfileIds] = useState<string[]>([]);
  const [comparisonPair, setComparisonPair] = useState<[ComparisonCandidate, ComparisonCandidate] | null>(null);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const receivedProfilesRef = useRef<ReceivedProfile[]>([]);
  const receivedRefreshInFlightRef = useRef<Promise<ReceivedProfile[]> | null>(null);
  const lastReceivedRefreshAtRef = useRef(0);

  const receivedDisabledIds = useMemo(
    () => receivedProfiles.filter((profile) => !profile.analysis_data).map((profile) => `received:${profile.id}`),
    [receivedProfiles]
  );
  const comparisonDisabledIds = useMemo(
    () => [...disabledProfileIds, ...receivedDisabledIds],
    [disabledProfileIds, receivedDisabledIds]
  );

  useEffect(() => {
    receivedProfilesRef.current = receivedProfiles;
  }, [receivedProfiles]);

  const refreshReceivedProfiles = useCallback(
    async ({ force = false, minIntervalMs = 1200 }: { force?: boolean; minIntervalMs?: number } = {}) => {
      if (!user) {
        return receivedProfilesRef.current;
      }

      const now = Date.now();
      const isFreshEnough = now - lastReceivedRefreshAtRef.current < minIntervalMs;
      if (!force && isFreshEnough) {
        return receivedProfilesRef.current;
      }

      if (receivedRefreshInFlightRef.current) {
        return receivedRefreshInFlightRef.current;
      }

      const authTokenForApi = authToken || undefined;
      const request = getReceivedProfiles(authTokenForApi)
        .then((profiles) => {
          receivedProfilesRef.current = profiles;
          setReceivedProfiles(profiles);
          lastReceivedRefreshAtRef.current = Date.now();
          return profiles;
        })
        .finally(() => {
          receivedRefreshInFlightRef.current = null;
        });

      receivedRefreshInFlightRef.current = request;
      return request;
    },
    [authToken, user]
  );

  useEffect(() => {
    setAuthToken(token || '');
  }, [token]);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const result = await checkAdminStatus();
        setIsAdmin(result.is_admin);
      } catch {
        setIsAdmin(false);
      }
    };
    if (user) checkAdmin();
  }, [user]);

  useEffect(() => {
    if (!isAuthLoading && !user && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      router.replace('/onboarding');
    }
  }, [user, isAuthLoading, router]);

  useEffect(() => {
    if (user && !user.name && !user.email) {
      refreshUser();
    }
  }, [user, refreshUser]);

  useEffect(() => {
    const loadTransactions = async () => {
      if (user) {
        const txs = await getTransactions(5, 0);
        setTransactions(txs);
      }
    };
    loadTransactions();
  }, [user]);

  useEffect(() => {
    const loadReceivedProfiles = async () => {
      if (!user) return;

      try {
        await refreshReceivedProfiles({ force: true, minIntervalMs: 0 });
      } catch (e) {
        console.error('Failed to load received profiles:', e);
      }
    };
    loadReceivedProfiles();
  }, [user, refreshReceivedProfiles]);

  useEffect(() => {
    const loadExpiration = async () => {
      if (user) {
        const exp = await getWalletExpiration();
        setExpiration(exp);
      }
    };
    loadExpiration();
  }, [user]);

  useEffect(() => {
    if (!isComparisonMode) return;

    setSelectedForComparison((prev) => prev.filter((id) => !comparisonDisabledIds.includes(id)));
  }, [comparisonDisabledIds, isComparisonMode]);

  const handleLogout = () => {
    const provider = user?.provider;
    logout();

    if (provider === 'kakao') {
      // 카카오는 완전 새로고침으로 상태 초기화
      window.location.href = '/onboarding';
    } else {
      router.push('/onboarding');
    }
  };

  const handleWithdraw = async () => {
    const provider = user?.provider || '';
    
    try {
      setIsWithdrawing(true);
      hasRedirectedRef.current = true;
      await withdraw();
      setIsWithdrawModalOpen(false);
      
      const redirectUrl = provider 
        ? `/withdraw-complete?provider=${provider}` 
        : '/withdraw-complete';
      
      window.location.href = redirectUrl;
    } catch {
      hasRedirectedRef.current = false;
      alert('회원 탈퇴 중 오류가 발생했습니다. 다시 시도해주세요.');
      setIsWithdrawing(false);
    }
  };

  const getProviderName = (provider?: string) => {
    switch (provider) {
      case 'kakao': return '카카오';
      case 'naver': return '네이버';
      default: return '이메일';
    }
  };

  const handleFeedbackSubmit = async (category: FeedbackCategory, content: string) => {
    await submitFeedback(category, content, authToken);
    showToast('소중한 의견 감사합니다!', 'success');
  };

  useEffect(() => {
    const loadUnreadFeedbackReplies = async () => {
      if (!user) {
        setUnreadFeedbackReplies(0);
        return;
      }

      try {
        const items = await getMyFeedbacks(authToken || undefined);
        setUnreadFeedbackReplies(items.filter((item) => item.has_unread_reply).length);
      } catch {
        setUnreadFeedbackReplies(0);
      }
    };

    void loadUnreadFeedbackReplies();
  }, [authToken, user]);

  const enterComparisonMode = async () => {
    setIsComparisonMode(true);
    setSelectedForComparison([]);
    setDisabledProfileIds([]);

    try {
      await refreshReceivedProfiles({ force: true, minIntervalMs: 0 });
    } catch (e) {
      console.error('Failed to prefetch cache status:', e);
    }
  };

  const executeComparison = async () => {
    if (selectedForComparison.length !== 2) return;

    setIsLoadingComparison(true);
    const authTokenForApi = authToken || undefined;
    let receivedProfilesSnapshot = receivedProfiles;

    try {
      const selectedSavedIds = selectedForComparison.filter((id) => !id.startsWith('received:'));
      const selectedReceivedIds = selectedForComparison
        .filter((id) => id.startsWith('received:'))
        .map((id) => id.replace('received:', ''));

      const hasUnreadyReceivedProfile = selectedReceivedIds.some((receivedId) => {
        const profile = receivedProfilesSnapshot.find((item) => item.id === receivedId);
        return !profile?.analysis_data;
      });

      if (hasUnreadyReceivedProfile) {
        try {
          const refreshedProfiles = await refreshReceivedProfiles({ force: true, minIntervalMs: 0 });
          receivedProfilesSnapshot = refreshedProfiles;
        } catch (e) {
          console.error('Failed to refresh received profiles before comparison:', e);
        }
      }

      const savedProfilesList = selectedSavedIds.length > 0
        ? await getProfiles(authTokenForApi)
        : [];
      const savedProfileMap = new Map(savedProfilesList.map((profile) => [profile.id, profile]));
      const candidates: ComparisonCandidate[] = [];
      let hasPendingReceivedAnalysis = false;
      let hasPendingSavedAnalysis = false;

      for (const id of selectedForComparison) {
        if (id.startsWith('received:')) {
          const receivedId = id.replace('received:', '');
          const receivedProfile = receivedProfilesSnapshot.find((p) => p.id === receivedId);
          if (receivedProfile) {
            const candidate = receivedToCandidate(receivedProfile);
            if (candidate) {
              candidates.push(candidate);
            } else {
              hasPendingReceivedAnalysis = true;
            }
          }
        } else {
          const profile = savedProfileMap.get(id);
          if (profile) {
            const candidate = await loadSavedProfileForComparison(profile, authTokenForApi);
            if (candidate) {
              candidates.push(candidate);
            } else {
              hasPendingSavedAnalysis = true;
            }
          }
        }
      }

      if (candidates.length === 2) {
        setComparisonPair([candidates[0], candidates[1]]);
        return;
      }

      if (hasPendingReceivedAnalysis) {
        showToast('선택한 공유 사주의 분석 데이터가 아직 준비 중입니다. 잠시 후 다시 시도해 주세요.', 'info');
      } else if (hasPendingSavedAnalysis) {
        showToast('선택한 저장 사주의 분석 데이터가 준비 중입니다. 잠시 후 다시 시도해 주세요.', 'info');
      } else {
        showToast('비교할 데이터를 불러오지 못했습니다. 다시 선택 후 시도해 주세요.', 'error');
      }
    } catch (e) {
      console.error('Failed to execute comparison:', e);
      const status =
        typeof e === 'object' && e !== null && 'status' in e
          ? (e as { status?: unknown }).status
          : undefined;

      if (e instanceof Error && e.message === 'AUTH_REQUIRED') {
        showToast('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.', 'error');
      } else if (status === 429 || (typeof status === 'number' && status >= 500)) {
        showToast(
          e instanceof Error
            ? e.message
            : '비교 데이터를 준비하는 중 요청이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
      } else {
        showToast('비교 데이터를 불러오는 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
      }
    } finally {
      setIsLoadingComparison(false);
    }
  };

  const toggleComparisonSelection = (id: string) => {
    setSelectedForComparison((prev) => {
      if (comparisonDisabledIds.includes(id)) return prev;
      if (prev.includes(id)) return prev.filter((selectedId) => selectedId !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const handleReanalyze = (profile: SavedProfile) => {
    const input = profileToBirthInput(profile);
    sessionStorage.removeItem('loaded_readonly_mode');
    sessionStorage.setItem('loaded_profile_id', profile.id);
    sessionStorage.setItem('loaded_input', JSON.stringify(input));
    sessionStorage.removeItem('loaded_result');
    sessionStorage.removeItem('loaded_history_id');
    sessionStorage.setItem('loaded_needs_reanalysis', 'true');
    router.push('/');
  };

  const handleSelectProfile = async (profile: SavedProfile) => {
    const input = profileToBirthInput(profile);
    sessionStorage.removeItem('loaded_readonly_mode');

    // 1. DB에서 profile_id 기준으로 우선 조회 (가장 정확)
    try {
      const authTokenForApi = authToken || undefined;
      const cachedByProfile = await getCachedReadingByProfile(profile.id, authTokenForApi);
      if (cachedByProfile) {
        sessionStorage.setItem('loaded_profile_id', profile.id);
        sessionStorage.setItem('loaded_input', JSON.stringify(input));
        try {
          sessionStorage.setItem('loaded_result', JSON.stringify(cachedByProfile));
        } catch {
          sessionStorage.removeItem('loaded_result');
        }
        sessionStorage.removeItem('loaded_history_id');
        router.push('/');
        return;
      }
    } catch (e) {
      console.error('Failed to fetch profile-based cache on mypage:', e);

      const status =
        typeof e === 'object' && e !== null && 'status' in e
          ? (e as { status?: unknown }).status
          : undefined;

      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        showToast(
          e instanceof Error
            ? e.message
            : '프로필 조회 요청이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
        return;
      }

      if (e instanceof Error && e.message === 'AUTH_REQUIRED') {
        showToast('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.', 'error');
        return;
      }
    }


    // 2. 서버 조회는 메인 페이지에서 profile_id 기준으로 수행
    sessionStorage.setItem('loaded_profile_id', profile.id);
    sessionStorage.setItem('loaded_input', JSON.stringify(input));
    router.push('/');
  };

  const handleOpenReceivedProfile = async (profile: ReceivedProfile) => {
    let targetProfile: ReceivedProfile = profile;

    if (!targetProfile.analysis_data) {
      try {
        const refreshedProfiles = await refreshReceivedProfiles({ force: true, minIntervalMs: 0 });
        const refreshed = refreshedProfiles.find((item) => item.id === profile.id);
        if (refreshed) {
          targetProfile = refreshed;
        }
      } catch (e) {
        console.error('Failed to refresh received profile:', e);
      }
    }

    if (!targetProfile.analysis_data) {
      showToast('공유받은 분석 데이터가 준비 중입니다. 잠시 후 다시 시도해 주세요.', 'info');
      return;
    }

    const input = {
      name: targetProfile.sharer_name || '공유 사주',
      birth_solar: targetProfile.birth_date,
      birth_time: jijiToTime(targetProfile.hour_branch),
      birth_jiji: targetProfile.hour_branch,
      calendar_type: targetProfile.calendar_type === 'lunar' ? 'lunar' : 'solar',
      gender: targetProfile.gender === 'female' ? 'female' : 'male',
      timezone: 'Asia/Seoul',
      birth_place: '',
      persona: targetProfile.persona || 'classic',
    };

    sessionStorage.removeItem('loaded_profile_id');
    sessionStorage.removeItem('loaded_history_id');
    sessionStorage.setItem('loaded_readonly_mode', 'received');
    sessionStorage.setItem('loaded_input', JSON.stringify(input));
    sessionStorage.setItem('loaded_result', JSON.stringify(targetProfile.analysis_data));
    router.push('/');
  };

  const handleCodeSubmit = async (code: string) => {
    try {
      const authTokenForApi = authToken || undefined;
      const saved = await saveReceivedProfile(authTokenForApi, code);
      await refreshReceivedProfiles({ force: true, minIntervalMs: 0 });
      if (saved.analysis_data) {
        showToast('사주를 성공적으로 추가했습니다.', 'success');
      } else {
        showToast('공유받은 사주가 등록되었지만 분석 데이터 준비 중입니다. 잠시 후 다시 시도해 주세요.', 'info');
      }
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteReceivedProfile = async (id: string) => {
    try {
      const authTokenForApi = authToken || undefined;
      await deleteReceivedProfile(authTokenForApi, id);
      receivedProfilesRef.current = receivedProfilesRef.current.filter((p) => p.id !== id);
      setReceivedProfiles(prev => prev.filter(p => p.id !== id));
      showToast('공유받은 사주가 삭제되었습니다.', 'success');
    } catch {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  if (isAuthLoading) {
    return (
      <div className={styles.redirectContainer}>
        <Loader2 size={20} className={styles.redirectSpinner} />
        <p className={styles.redirectText}>로그인 상태를 확인 중입니다...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.redirectContainer}>
        <Loader2 size={20} className={styles.redirectSpinner} />
        <p className={styles.redirectText}>로그인 페이지로 이동 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.container} data-testid="mypage-page">
      {comparisonPair && (
        <ComparisonView
          dataA={comparisonPair[0].data}
          nameA={comparisonPair[0].name}
          inputA={comparisonPair[0].input}
          dataB={comparisonPair[1].data}
          nameB={comparisonPair[1].name}
          inputB={comparisonPair[1].input}
          onClose={() => {
            setComparisonPair(null);
            setIsComparisonMode(false);
            setSelectedForComparison([]);
          }}
        />
      )}

      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => router.back()}>
          <ArrowLeft size={24} />
        </button>
        <h1 className={styles.pageTitle}>마이페이지</h1>
      </header>

      <main className={styles.content}>
        <section className={styles.section} style={{ animationDelay: '0ms' }}>
          <div className={styles.glassCard}>
            <div className={styles.profileHeader}>
              <div className={styles.avatarContainer}>
                {user.profile_image ? (
                  <Image
                    src={user.profile_image}
                    alt="Profile"
                    width={88}
                    height={88}
                    className={styles.avatarImage}
                    priority
                  />
                ) : (
                  <UserIcon size={40} className={styles.defaultAvatar} />
                )}
              </div>
              <div className={styles.profileInfo}>
                <h2>{user.name || '사용자'}</h2>
                <div className={styles.providerBadge}>
                  {user.provider && (
                    <span className={styles.providerIcon}>
                      {user.provider === 'kakao' && 'K'}
                      {user.provider === 'naver' && 'N'}
                    </span>
                  )}
                  {getProviderName(user.provider)}로 로그인 중
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 엽전 섹션 */}
        <section className={styles.section} style={{ animationDelay: '50ms' }}>
          <h3 className={styles.sectionTitle}>
            <Coins size={16} />
            내 엽전
          </h3>
          <div className={styles.glassCard}>
            <div className={styles.coinSection}>
              <div className={styles.coinBalance}>
                <div className={styles.coinIcon}>
                  <Coins size={32} />
                </div>
                <div className={styles.coinInfo}>
                  <span className={styles.coinValue}>
                    {walletError ? '확인 필요' : (wallet?.balance?.toLocaleString() ?? '0')}
                  </span>
                  <span className={styles.coinUnit}>엽전</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.chargeButton}
                onClick={() => router.push('/charge')}
              >
                <Plus size={18} />
                충전하기
              </button>
            </div>

            {walletError && (
              <div className={styles.expirationBanner}>
                <AlertTriangle size={16} className={styles.expirationIcon} />
                <div className={styles.expirationText}>{walletError}</div>
              </div>
            )}

            {expiration && expiration.expiring_soon_balance > 0 && (
              <div className={styles.expirationBanner}>
                <AlertTriangle size={16} className={styles.expirationIcon} />
                <div className={styles.expirationText}>
                  <span className={styles.expirationAmount}>
                    {expiration.expiring_soon_balance.toLocaleString()}엽전
                  </span>
                  이 30일 내 만료됩니다
                  {expiration.expiring_soon_date && (
                    <span className={styles.expirationDate}>
                      (~{new Date(expiration.expiring_soon_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {transactions.length > 0 && (
          <section className={styles.section} style={{ animationDelay: '75ms' }}>
            <h3 className={styles.sectionTitle}>
              <History size={16} />
              거래 내역
            </h3>
            <div className={styles.glassCard} style={{ padding: 0 }}>
              <div className={styles.transactionList}>
                {transactions.map((tx) => (
                  <div key={tx.id} className={styles.transactionItem}>
                    <div className={styles.transactionInfo}>
<span className={`${styles.transactionType} ${tx.type === 'charge' || tx.type === 'bonus' || tx.type === 'refund' ? styles.typeCharge : styles.typeSpend}`}>
                        {tx.type === 'charge' && <><Coins size={12} /> 충전</>}
                        {tx.type === 'spend' && <><Minus size={12} /> 사용</>}
                        {tx.type === 'refund' && <><RotateCcw size={12} /> 환불</>}
                        {tx.type === 'bonus' && <><Gift size={12} /> 보너스</>}
                      </span>
                      <span className={styles.transactionDesc}>{tx.description || '-'}</span>
                    </div>
                    <div className={styles.transactionAmount}>
                      <span className={tx.amount > 0 ? styles.amountPlus : styles.amountMinus}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                      </span>
                      <span className={styles.transactionDate}>
                        {new Date(tx.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className={styles.section} style={{ animationDelay: '100ms' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className={styles.sectionTitle}>
              <Star size={16} />
              저장된 사주
            </h3>
            <button
              type="button"
              onClick={() => {
                if (isComparisonMode) {
                  setIsComparisonMode(false);
                  setSelectedForComparison([]);
                } else {
                  void enterComparisonMode();
                }
              }}
              className={styles.comparisonToggleBtn}
            >
              <GitCompare size={14} />
              {isComparisonMode ? '비교 취소' : '궁합 비교'}
            </button>
          </div>
          <div className={styles.glassCard} style={{ padding: 0 }}>
            <div className={styles.savedProfilesScroll}>
              <SavedProfilesList
                token={authToken}
                onSelectProfile={isComparisonMode ? undefined : handleSelectProfile}
                onReanalyze={handleReanalyze}
                comparisonMode={isComparisonMode}
                selectedProfileIds={selectedForComparison}
                onToggleComparisonSelect={(profile) => toggleComparisonSelection(profile.id)}
                disabledProfileIds={disabledProfileIds}
              />
            </div>

            {isComparisonMode && (
              <div className={styles.comparisonFloatingBar}>
                <button
                  type="button"
                  className={styles.comparisonCancelBtn}
                  onClick={() => {
                    setIsComparisonMode(false);
                    setSelectedForComparison([]);
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={styles.comparisonExecuteBtn}
                  disabled={selectedForComparison.length !== 2 || isLoadingComparison}
                  onClick={executeComparison}
                >
                  {isLoadingComparison ? (
                    <>
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> 불러오는 중...
                    </>
                  ) : (
                    <>
                      <GitCompare size={16} />{' '}
                      {selectedForComparison.length === 2
                        ? '두 명 비교하기'
                        : `${selectedForComparison.length}명 선택됨 (2명 필요)`}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className={styles.section} style={{ animationDelay: '120ms' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className={styles.sectionTitle}>
              <UserIcon size={16} />
              공유받은 사주 ({receivedProfiles.length})
            </h3>
            <button
              type="button"
              onClick={() => setIsCodeModalOpen(true)}
              className={styles.comparisonToggleBtn}
            >
              <Plus size={14} />
              코드로 추가
            </button>
          </div>
          <div className={styles.glassCard} style={{ padding: 0 }}>
            <ReceivedProfilesList
              profiles={receivedProfiles}
              onDelete={handleDeleteReceivedProfile}
              onOpen={handleOpenReceivedProfile}
              isComparisonMode={isComparisonMode}
              selectedIds={selectedForComparison}
              disabledIds={comparisonDisabledIds}
              onToggleSelect={toggleComparisonSelection}
            />
          </div>
        </section>


        <section className={styles.section} style={{ animationDelay: '150ms' }}>
          <h3 className={styles.sectionTitle}>
            <Sparkles size={16} />
            저장된 궁합
          </h3>
          <div className={styles.glassCard} style={{ padding: 0 }}>
            <CompatibilityHistoryList token={authToken} />
          </div>
        </section>

        <section className={styles.section} style={{ animationDelay: '150ms' }}>
          <h3 className={styles.sectionTitle}>
            <Palette size={16} />
            화면 설정
          </h3>
          <ThemeSelector />
        </section>

        {isAdmin && (
          <section className={styles.section} style={{ animationDelay: '200ms' }}>
            <h3 className={styles.sectionTitle}>
              <Settings size={16} />
              관리자
            </h3>
            <div className={styles.glassCard} style={{ padding: 0 }}>
              <div className={styles.menuList}>
                <Link href="/admin" className={styles.menuItem}>
                  <div className={styles.menuContent}>
                    <Settings size={20} className={styles.menuIcon} />
                    <span className={styles.menuText}>관리자 대시보드</span>
                  </div>
                  <ChevronRight size={20} className={styles.menuArrow} />
                </Link>
              </div>
            </div>
          </section>
        )}

        <section className={styles.section} style={{ animationDelay: isAdmin ? '250ms' : '200ms' }}>
          <h3 className={styles.sectionTitle}>
            <Info size={16} />
            서비스 안내
          </h3>
          <div className={styles.glassCard} style={{ padding: 0 }}>
            <div className={styles.menuList}>
              <Link href="/about" className={styles.menuItem}>
                <div className={styles.menuContent}>
                  <Sparkles size={20} className={styles.menuIcon} />
                  <span className={styles.menuText}>서비스 소개</span>
                </div>
                <ChevronRight size={20} className={styles.menuArrow} />
              </Link>
              <Link href="/terms" className={styles.menuItem}>
                <div className={styles.menuContent}>
                  <FileText size={20} className={styles.menuIcon} />
                  <span className={styles.menuText}>이용약관</span>
                </div>
                <ChevronRight size={20} className={styles.menuArrow} />
              </Link>
              <Link href="/privacy" className={styles.menuItem}>
                <div className={styles.menuContent}>
                  <Shield size={20} className={styles.menuIcon} />
                  <span className={styles.menuText}>개인정보처리방침</span>
                </div>
                <ChevronRight size={20} className={styles.menuArrow} />
              </Link>
              <button 
                type="button"
                className={styles.menuItem}
                onClick={() => setIsFeedbackModalOpen(true)}
              >
                <div className={styles.menuContent}>
                  <MessageSquarePlus size={20} className={styles.menuIcon} />
                  <div className={styles.menuTextRow}>
                    <span className={styles.menuText}>문의/의견 보내기</span>
                    {unreadFeedbackReplies > 0 && (
                      <span className={styles.menuBadge}>답변 {unreadFeedbackReplies}</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={20} className={styles.menuArrow} />
              </button>
            </div>
          </div>
        </section>

        <section className={styles.section} style={{ animationDelay: '250ms' }}>
          <div className={styles.glassCard} style={{ padding: 0 }}>
            <div className={styles.menuList}>
              <button type="button" className={styles.menuItem} onClick={handleLogout}>
                <div className={styles.menuContent}>
                  <LogOut size={20} className={styles.menuIcon} />
                  <span className={styles.menuText}>로그아웃</span>
                </div>
                <ChevronRight size={20} className={styles.menuArrow} />
              </button>
              
              <button 
                type="button"
                className={`${styles.menuItem} ${styles.dangerItem}`}
                onClick={() => setIsWithdrawModalOpen(true)}
              >
                <div className={styles.menuContent}>
                  <UserIcon size={20} className={styles.menuIcon} />
                  <div className={styles.menuTextBlock}>
                    <span className={styles.menuText}>회원 탈퇴</span>
                    <span className={styles.menuSubText}>탈퇴 즉시 개인정보/분석 기록 영구 삭제</span>
                  </div>
                </div>
                <ChevronRight size={20} className={styles.menuArrow} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        onConfirm={handleWithdraw}
        isLoading={isWithdrawing}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
        onRepliesRead={(count) => setUnreadFeedbackReplies((prev) => Math.max(0, prev - count))}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <CodeInputModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        onSubmit={handleCodeSubmit}
      />
    </div>
  );
}
