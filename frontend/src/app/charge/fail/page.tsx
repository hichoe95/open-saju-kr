'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { XCircle, Loader2, RefreshCw, Home, HelpCircle } from 'lucide-react';
import {
  advanceSummaryHubResumeToken,
  clearArmedSummaryHubResumePayment,
  resolveSummaryHubResumeReadingIdForPaymentReturn,
} from '@/lib/summaryHubResume';
import Footer from '@/components/Footer';
import styles from './page.module.css';
import { publicContactEmail } from '@/lib/publicConfig';

const ERROR_MESSAGES: Record<string, string> = {
  'PAY_PROCESS_CANCELED': '결제가 취소되었습니다.',
  'PAY_PROCESS_ABORTED': '결제 진행 중 문제가 발생했습니다.',
  'REJECT_CARD_COMPANY': '카드사에서 결제가 거부되었습니다.',
  'INVALID_CARD_NUMBER': '카드 번호가 올바르지 않습니다.',
  'INVALID_CARD_EXPIRY': '카드 유효기간이 올바르지 않습니다.',
  'EXCEED_MAX_DAILY_PAYMENT_COUNT': '일일 결제 한도를 초과했습니다.',
  'EXCEED_MAX_PAYMENT_AMOUNT': '결제 한도를 초과했습니다.',
  'NOT_SUPPORTED_CARD_TYPE': '지원하지 않는 카드 유형입니다.',
};

function getSafeDisplayMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] || '결제가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.';
}

function FailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorCode = searchParams.get('code') || '';
  const displayMessage = getSafeDisplayMessage(errorCode);
  const isUserCancel = errorCode === 'PAY_PROCESS_CANCELED' || errorCode === 'USER_CANCEL';

  useEffect(() => {
    const paymentResumeReadingId = resolveSummaryHubResumeReadingIdForPaymentReturn();
    if (!paymentResumeReadingId) {
      return;
    }

    const event = isUserCancel ? 'payment_cancel' : 'payment_failure';
    const resumeFlow = advanceSummaryHubResumeToken(paymentResumeReadingId, event);
    clearArmedSummaryHubResumePayment();

    if (resumeFlow) {
      window.location.assign('/');
    }
  }, [isUserCancel]);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <XCircle size={72} className={isUserCancel ? styles.cancelIcon : styles.errorIcon} />
          </div>
          
          <h1 className={styles.title}>
            {isUserCancel ? '결제 취소' : '결제 실패'}
          </h1>
          
          <p className={styles.message}>{displayMessage}</p>
          
          {errorCode && !isUserCancel && (
            <div className={styles.errorCodeBox}>
              <span className={styles.errorCodeLabel}>오류 코드</span>
              <code className={styles.errorCode}>{errorCode}</code>
            </div>
          )}

          {!isUserCancel && (
            <div className={styles.helpBox}>
              <HelpCircle size={16} />
              <p>
                문제가 계속되면 다른 결제 수단을 이용하거나<br/>
                <a href={`mailto:${publicContactEmail}`} className={styles.link}>고객센터</a>로 문의해 주세요.
              </p>
            </div>
          )}

          <div className={styles.actionButtons}>
            <button type="button" onClick={() => router.push('/charge')} className={styles.primaryButton}>
              <RefreshCw size={18} />
              다시 시도하기
            </button>
            <button type="button" onClick={() => router.push('/')} className={styles.secondaryButton}>
              <Home size={18} />
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </div>
      <Footer variant="minimal" />
    </div>
  );
}

export default function ChargeFailPage() {
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
      <FailContent />
    </Suspense>
  );
}
