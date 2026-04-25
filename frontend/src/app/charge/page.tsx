'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Coins, Check, AlertCircle, Loader2, ShieldCheck, Lock, CreditCard } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePayment } from '@/contexts/PaymentContext';
import { CoinProduct } from '@/types/payment';
import { getProducts, preparePayment } from '@/lib/paymentApi';
import Footer from '@/components/Footer';
import { useAnalytics } from '@/hooks/useAnalytics';
import styles from './page.module.css';

export default function ChargePage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { wallet, walletError } = usePayment();
  useAnalytics({ autoTrackPageView: true, pageName: 'charge' });
  const [products, setProducts] = useState<CoinProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CoinProduct | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);

  const backAttemptRef = useRef(0);

  const handleGoBack = useCallback(() => {
    backAttemptRef.current = 0;

    const tryBack = () => {
      if (backAttemptRef.current >= 3) {
        router.replace('/');
        return;
      }
      backAttemptRef.current += 1;

      let handled = false;
      const onPopState = () => {
        handled = true;
        window.removeEventListener('popstate', onPopState);
        if (window.location.pathname === '/charge') {
          tryBack();
        }
      };
      window.addEventListener('popstate', onPopState, { once: true });
      window.history.back();

      setTimeout(() => {
        if (!handled) {
          window.removeEventListener('popstate', onPopState);
          router.replace('/');
        }
      }, 300);
    };

    tryBack();
  }, [router]);

  const loadProducts = useCallback(async () => {
    try {
      setProductLoadError(null);
      const data = await getProducts();
      setProducts(data);
      if (data.length > 0) {
        setSelectedProduct(data[0]);
      } else {
        setSelectedProduct(null);
      }
    } catch (e) {
      console.error('Failed to load products:', e);
      setProducts([]);
      setSelectedProduct(null);
      setProductLoadError('상품을 불러오지 못했습니다. 다시 시도해주세요.');
    }
  }, []);

  // 토스페이먼츠 SDK v2 로드
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.TossPayments) {
      const script = document.createElement('script');
      script.src = 'https://js.tosspayments.com/v2/standard';
      script.async = true;
      script.onload = () => setIsSdkLoaded(true);
      document.body.appendChild(script);

      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    } else {
      setIsSdkLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handlePurchase = async () => {
    if (!selectedProduct || !user || !isSdkLoaded || !isAgreed) return;

    setIsProcessing(true);
    setError(null);

    try {
      const prepareData = await preparePayment(selectedProduct.id);
      if (!prepareData) {
        throw new Error('결제 준비 실패');
      }

      if (!prepareData.client_key) {
        throw new Error('결제 키를 불러오지 못했습니다');
      }

      if (prepareData.amount !== selectedProduct.price) {
        const refreshedProduct = { ...selectedProduct, price: prepareData.amount };
        setProducts((prev) =>
          prev.map((product) =>
            product.id === refreshedProduct.id
              ? { ...product, price: prepareData.amount }
              : product
          )
        );
        setSelectedProduct(refreshedProduct);
      }

      const tossPayments = window.TossPayments(prepareData.client_key);
      const customerKey = `SAJU_USER_${user.user_id}`;
      const payment = tossPayments.payment({ customerKey });

      await payment.requestPayment({
        method: 'CARD',
        amount: {
          currency: 'KRW',
          value: prepareData.amount,
        },
        orderId: prepareData.order_id,
        orderName: prepareData.order_name,
        customerName: prepareData.customer_name,
        customerEmail: prepareData.customer_email,
        successUrl: `${window.location.origin}/charge/success`,
        failUrl: `${window.location.origin}/charge/fail`,
        card: {
          useEscrow: false,
          flowMode: 'DEFAULT',
          useCardPoint: false,
          useAppCardOnly: false,
        },
      });
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error.code === 'USER_CANCEL' || error.code === 'PAY_PROCESS_CANCELED') {
        setError(null);
      } else {
        setError(error.message || '결제 처리 중 오류가 발생했습니다');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // 로딩 중
  if (isAuthLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={styles.spinner} size={32} />
      </div>
    );
  }

  // 비로그인
  if (!user) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <button type="button" onClick={handleGoBack} className={styles.backButton}>
            <ArrowLeft size={24} />
          </button>
          <h1>엽전 충전</h1>
        </header>
        <div className={styles.loginPrompt}>
          <p>로그인이 필요한 서비스입니다.</p>
          <button type="button" onClick={() => router.push('/onboarding')} className={styles.loginButton}>
            로그인하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" onClick={handleGoBack} className={styles.backButton}>
          <ArrowLeft size={24} />
        </button>
        <h1>엽전 충전</h1>
      </header>

      <main className={styles.mainContent}>
        {/* 현재 잔액 카드 */}
        <section className={styles.balanceSection}>
          <div className={styles.balanceCard}>
            <div className={styles.balanceHeader}>
              <span className={styles.balanceLabel}>현재 보유 엽전</span>
              <Coins className={styles.balanceIconBg} size={80} />
            </div>
            <div className={styles.balanceValueWrapper}>
              <span className={styles.balanceValue}>
                {walletError ? '확인 필요' : (wallet?.balance?.toLocaleString() ?? '0')}
              </span>
              <span className={styles.balanceUnit}>엽전</span>
            </div>
            <p className={styles.balanceDesc}>1,000원 = 100엽전</p>
            {walletError && <p className={styles.balanceDesc}>{walletError}</p>}
          </div>
        </section>

        {/* 상품 선택 */}
        <section className={styles.productSection}>
          <h2 className={styles.sectionTitle}>상품 선택</h2>
          {productLoadError && products.length === 0 ? (
            <div className={styles.productErrorCard}>
              <p className={styles.productErrorText}>상품을 불러오지 못했습니다. 다시 시도해주세요.</p>
              <button type="button" className={styles.retryButton} onClick={() => void loadProducts()}>
                다시 시도
              </button>
            </div>
          ) : (
            <div className={styles.productGrid}>
              {products.map((product, index) => {
                const isSelected = selectedProduct?.id === product.id;
                const isBest = product.bonus_amount > 0 && index === 1; // 예시 로직: 두번째 상품 추천

                return (
                  <button
                    type="button"
                    key={product.id}
                    className={`${styles.productCard} ${isSelected ? styles.selected : ''}`}
                    onClick={() => setSelectedProduct(product)}
                  >
                    {isBest && <div className={styles.bestBadge}>BEST</div>}
                    <div className={styles.productContent}>
                      <div className={styles.coinAmount}>
                        <span className={styles.amountValue}>{product.coin_amount.toLocaleString()}</span>
                        <span className={styles.amountUnit}>엽전</span>
                      </div>
                      {product.bonus_amount > 0 && (
                        <div className={styles.bonusBadge}>
                          +{product.bonus_amount} 보너스
                        </div>
                      )}
                      <div className={styles.priceTag}>
                        {product.price.toLocaleString()}원
                      </div>
                    </div>
                    {isSelected && (
                      <div className={styles.checkOverlay}>
                        <Check size={20} color="white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* 주문 요약 및 결제 */}
        {selectedProduct && (
          <section className={styles.summarySection}>
            <h2 className={styles.sectionTitle}>주문 요약</h2>
            <div className={styles.summaryCard}>
              <div className={styles.summaryRow}>
                <span>충전 엽전</span>
                <span>{selectedProduct.coin_amount.toLocaleString()} 엽전</span>
              </div>
              {selectedProduct.bonus_amount > 0 && (
                <div className={`${styles.summaryRow} ${styles.bonusText}`}>
                  <span>보너스 엽전</span>
                  <span>+{selectedProduct.bonus_amount.toLocaleString()} 엽전</span>
                </div>
              )}
              <div className={styles.divider} />
              <div className={styles.totalRow}>
                <span>최종 결제 금액</span>
                <span className={styles.totalPrice}>{selectedProduct.price.toLocaleString()}원</span>
              </div>
            </div>

            {/* 약관 동의 */}
            <div className={styles.termsBox}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isAgreed}
                  onChange={(e) => setIsAgreed(e.target.checked)}
                  className={styles.checkbox}
                />
                <span className={styles.checkboxText}>
                  [필수] <a href="/terms" target="_blank" rel="noopener noreferrer" className={styles.link}>이용약관</a> 및 <a href="/refund" target="_blank" rel="noopener noreferrer" className={styles.link}>환불정책</a>에 동의합니다.
                </span>
              </label>
              <p className={styles.noticeText}>
                • 엽전은 결제 완료 즉시 충전되어 서비스 내 유료 기능 결제에 사용됩니다.<br/>
                • 충전 엽전의 이용기간 및 환불 신청 가능 기간은 결제일로부터 1년입니다.<br/>
                • 환불은 원결제수단으로 진행되며, 충전 엽전은 사용자 간 양도가 불가합니다.
              </p>
            </div>

            {/* 에러 메시지 */}
            {error && (
              <div className={styles.error}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* 결제 버튼 */}
            <button
              type="button"
              className={styles.purchaseButton}
              onClick={handlePurchase}
              disabled={!isAgreed || isProcessing || !isSdkLoaded}
            >
              {isProcessing ? (
                <>
                  <Loader2 className={styles.buttonSpinner} size={20} />
                  결제 처리 중...
                </>
              ) : (
                `${selectedProduct.price.toLocaleString()}원 결제하기`
              )}
            </button>
            
            <div className={styles.trustBadges}>
              <div className={styles.trustItem}>
                <CreditCard size={14} />
                <span>토스페이먼츠 안전결제</span>
              </div>
              <div className={styles.trustItem}>
                <Lock size={14} />
                <span>SSL 보안 암호화</span>
              </div>
              <div className={styles.trustItem}>
                <ShieldCheck size={14} />
                <span>구매 안전 보장</span>
              </div>
            </div>
          </section>
        )}
      </main>
      
      <Footer className={styles.footer} />
    </div>
  );
}
