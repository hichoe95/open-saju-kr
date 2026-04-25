'use client';

import { useCallback, useEffect, useRef, useState, Suspense, startTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, AlertCircle, Loader2, Coins, Sparkles, ArrowRight } from 'lucide-react';
import { usePayment } from '@/contexts/PaymentContext';
import ReferralCTA from '@/components/ReferralCTA';
import { confirmPayment, spendCoins } from '@/lib/paymentApi';
import { getReadingDetail } from '@/lib/api';
import {
  advanceSummaryHubResumeToken,
  clearArmedSummaryHubResumePayment,
  replaceSummaryHubResumeSnapshotResult,
  resolveSummaryHubResumeReadingIdForPaymentReturn,
} from '@/lib/summaryHubResume';
import Footer from '@/components/Footer';
import styles from './page.module.css';

const CONFIRM_SESSION_PREFIX = 'charge-confirm:';
const CONFIRM_IN_FLIGHT_TTL_MS = 30_000;

type ConfirmSessionState = {
  state: 'in_flight' | 'done';
  updatedAt: number;
  chargedAmount?: number;
};

function buildConfirmSessionKey(orderId: string, paymentKey: string) {
  return `${CONFIRM_SESSION_PREFIX}${orderId}:${paymentKey}`;
}

function readConfirmSessionState(sessionKey: string): ConfirmSessionState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(sessionKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ConfirmSessionState;
    if (!parsed || (parsed.state !== 'in_flight' && parsed.state !== 'done')) {
      window.sessionStorage.removeItem(sessionKey);
      return null;
    }

    if (parsed.state === 'in_flight' && Date.now() - parsed.updatedAt > CONFIRM_IN_FLIGHT_TTL_MS) {
      window.sessionStorage.removeItem(sessionKey);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(sessionKey);
    return null;
  }
}

function writeConfirmSessionState(sessionKey: string, state: ConfirmSessionState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(sessionKey, JSON.stringify(state));
}

function clearConfirmSessionState(sessionKey: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(sessionKey);
}

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallet, walletError, refreshWallet, applyWalletBalance } = usePayment();
  const isConfirmingRef = useRef(false);
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('결제를 확인하고 있습니다...');
  const [chargedAmount, setChargedAmount] = useState<number>(0);
  const [requestedAmount, setRequestedAmount] = useState<number | null>(null);

  const handleConfirm = useCallback(async (force: boolean = false) => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const requestedAmountParam = searchParams.get('amount');
    const isValidPaymentKey = (value: string) => value.trim().length >= 8;
    const isValidOrderId = (value: string) => /^SAJU_[A-Z0-9]+$/.test(value);

    if (!paymentKey || !orderId || !requestedAmountParam) {
      startTransition(() => {
        setStatus('error');
        setMessage('잘못된 결제 정보입니다');
      });
      return;
    }

    if (!isValidPaymentKey(paymentKey) || !isValidOrderId(orderId)) {
      startTransition(() => {
        setStatus('error');
        setMessage('잘못된 결제 확인 정보입니다');
      });
      return;
    }

    const parsedRequestedAmount = Number.parseInt(requestedAmountParam, 10);
    if (!Number.isFinite(parsedRequestedAmount) || parsedRequestedAmount <= 0) {
      startTransition(() => {
        setStatus('error');
        setMessage('잘못된 결제 금액 정보입니다');
      });
      return;
    }

    startTransition(() => {
      setRequestedAmount(parsedRequestedAmount);
    });

    const finalizeResumeUnlock = async (orderIdForUnlock: string) => {
      const paymentResumeReadingId = resolveSummaryHubResumeReadingIdForPaymentReturn();
      if (!paymentResumeReadingId) {
        return false;
      }

      const spendResult = await spendCoins(
        'reading_reanalyze',
        paymentResumeReadingId,
        `summary-hub-detail:${paymentResumeReadingId}:${orderIdForUnlock}`
      );

      if (typeof spendResult.balance === 'number') {
        applyWalletBalance(spendResult.balance);
      }

      const detailResult = await getReadingDetail(paymentResumeReadingId);
      replaceSummaryHubResumeSnapshotResult(paymentResumeReadingId, detailResult);
      advanceSummaryHubResumeToken(paymentResumeReadingId, 'payment_success');
      clearArmedSummaryHubResumePayment();
      window.location.assign('/');
      return true;
    };

    const sessionKey = buildConfirmSessionKey(orderId, paymentKey);
    const sessionState = force ? null : readConfirmSessionState(sessionKey);

    if (!force && sessionState?.state === 'done') {
      const restoredChargedAmount = sessionState.chargedAmount ?? parsedRequestedAmount;
      startTransition(() => {
        setStatus('success');
        setChargedAmount(restoredChargedAmount);
        setMessage(`${restoredChargedAmount.toLocaleString()}엽전이 충전되었습니다!`);
      });
      await refreshWallet();
      try {
        const resumed = await finalizeResumeUnlock(orderId);
        if (resumed) {
          return;
        }
      } catch (resumeError) {
        startTransition(() => {
          setStatus('error');
          setMessage(resumeError instanceof Error ? resumeError.message : '결제 후 상세 사주 복귀에 실패했습니다.');
        });
        clearArmedSummaryHubResumePayment();
        return;
      }
      return;
    }

    if (!force && sessionState?.state === 'in_flight') {
      startTransition(() => {
        setStatus('processing');
        setMessage('이전 결제 확인 요청을 처리 중입니다. 잠시 후 잔액을 확인해 주세요.');
      });
      await refreshWallet();
      return;
    }

    if (isConfirmingRef.current) {
      return;
    }

    isConfirmingRef.current = true;
    writeConfirmSessionState(sessionKey, {
      state: 'in_flight',
      updatedAt: Date.now(),
    });

    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000];
    let lastError: unknown;

    try {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const result = await confirmPayment(paymentKey, orderId, parsedRequestedAmount);
          writeConfirmSessionState(sessionKey, {
            state: 'done',
            updatedAt: Date.now(),
            chargedAmount: result.charged,
          });
          applyWalletBalance(result.balance);
          startTransition(() => {
            setStatus('success');
            setChargedAmount(result.charged);
            setMessage(`${result.charged.toLocaleString()}엽전이 충전되었습니다!`);
          });
          await refreshWallet();

          try {
            const resumed = await finalizeResumeUnlock(orderId);
            if (resumed) {
              return;
            }
          } catch (resumeError) {
            clearConfirmSessionState(sessionKey);
            startTransition(() => {
              setStatus('error');
              setMessage(resumeError instanceof Error ? resumeError.message : '결제 후 상세 사주 복귀에 실패했습니다.');
            });
            clearArmedSummaryHubResumePayment();
            return;
          }

          return;
        } catch (e: unknown) {
          lastError = e;
          if (attempt < maxRetries - 1) {
            writeConfirmSessionState(sessionKey, {
              state: 'in_flight',
              updatedAt: Date.now(),
            });
            startTransition(() => {
              setMessage(`확인 중... (${attempt + 1}/${maxRetries})`);
            });
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          }
        }
      }

      clearConfirmSessionState(sessionKey);
      const error = lastError as { message?: string };
      startTransition(() => {
        setStatus('error');
        setMessage(error.message || '결제 확인 중 오류가 발생했습니다');
      });
    } finally {
      isConfirmingRef.current = false;
    }
  }, [applyWalletBalance, refreshWallet, searchParams]);

  useEffect(() => {
    handleConfirm();
  }, [handleConfirm]);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <div className={styles.card}>
          {status === 'processing' && (
            <>
              <div className={styles.iconWrapper}>
                <Loader2 size={64} className={styles.spinner} />
              </div>
              <h1 className={styles.title}>결제 확인 중</h1>
              <p className={styles.description}>{message}</p>
              <p className={styles.hint}>잠시만 기다려 주세요...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className={styles.successIconWrapper}>
                <Sparkles className={styles.sparkle1} size={24} />
                <CheckCircle size={72} className={styles.successIcon} />
                <Sparkles className={styles.sparkle2} size={20} />
              </div>
              <h1 className={styles.title}>충전 완료!</h1>
              <div className={styles.amountBox}>
                <Coins size={28} className={styles.coinIcon} />
                <span className={styles.amount}>+{chargedAmount.toLocaleString()}</span>
                <span className={styles.unit}>엽전</span>
              </div>
              
              <div className={styles.balanceInfo}>
                <span className={styles.balanceLabel}>현재 보유 엽전</span>
                <span className={styles.balanceValue}>
                  {walletError ? '확인 필요' : `${wallet?.balance?.toLocaleString() ?? '0'}엽전`}
                </span>
              </div>

              {walletError && <p className={styles.hint}>{walletError}</p>}

              {requestedAmount !== null && (
                <p className={styles.hint}>
                  요청 금액: {requestedAmount.toLocaleString()}원 (최종 충전은 서버 승인 결과 기준)
                </p>
              )}

              <ReferralCTA variant="card" surface="charge_success" />

              <div className={styles.nextActions}>
                <p className={styles.nextTitle}>이제 무엇을 해볼까요?</p>
                <div className={styles.actionButtons}>
                  <button type="button" onClick={() => router.push('/')} className={styles.primaryButton}>
                    사주 분석 받기
                    <ArrowRight size={18} />
                  </button>
                  <button type="button" onClick={() => router.push('/charge')} className={styles.secondaryButton}>
                    추가 충전하기
                  </button>
                </div>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className={styles.iconWrapper}>
                <AlertCircle size={64} className={styles.errorIcon} />
              </div>
              <h1 className={styles.title}>충전 실패</h1>
              <p className={styles.errorMessage}>{message}</p>
              <p className={styles.hint}>
                결제가 완료되었는데 이 화면이 보인다면,<br/>
                잠시 후 잔액을 확인해 주세요.
              </p>
              <div className={styles.actionButtons}>
                <button type="button" onClick={() => router.push('/charge')} className={styles.primaryButton}>
                  다시 시도하기
                </button>
                <button type="button" onClick={() => router.push('/')} className={styles.secondaryButton}>
                  홈으로 돌아가기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <Footer variant="minimal" />
    </div>
  );
}

export default function ChargeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.pageWrapper}>
          <div className={styles.container}>
            <div className={styles.card}>
              <Loader2 size={64} className={styles.spinner} />
              <h1 className={styles.title}>로딩 중...</h1>
            </div>
          </div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
