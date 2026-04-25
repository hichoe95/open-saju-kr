'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  startTransition,
} from 'react';
import { Wallet, FeaturePrices } from '@/types/payment';
import {
  getWallet,
  getPrices,
  PaymentApiError,
} from '@/lib/paymentApi';
import { useAuth } from './AuthContext';

interface PaymentContextType {
  wallet: Wallet | null;
  walletError: string | null;
  prices: FeaturePrices | null;
  isLoading: boolean;
  refreshWallet: () => Promise<void>;
  applyWalletBalance: (balance: number) => void;
  refreshAll: () => Promise<void>;
  canUseFeature: (featureKey: string) => {
    canUse: boolean;
    price: number;
  };
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

export function PaymentProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [prices, setPrices] = useState<FeaturePrices | null>(null);
  const [isLoading, setIsLoading] = useState(true);

   const refreshWallet = useCallback(async () => {
     if (!isAuthenticated) return;
     try {
       const data = await getWallet();
       startTransition(() => {
         setWallet(data);
         setWalletError(null);
       });
     } catch (error) {
       const message = error instanceof PaymentApiError
         ? error.message
         : '지갑 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

       startTransition(() => {
         setWallet(null);
         setWalletError(message);
       });
     }
   }, [isAuthenticated]);

   const applyWalletBalance = useCallback((balance: number) => {
     startTransition(() => {
       setWallet((prev) => ({
         balance,
         total_charged: prev?.total_charged ?? 0,
         total_spent: prev?.total_spent ?? 0,
       }));
       setWalletError(null);
     });
   }, []);

   // TODO FRONT-10: SWR-like 캐시/TTL 전략으로 컴포넌트 마운트마다 지갑 재조회 방지
   const fetchPrices = useCallback(async () => {
     const data = await getPrices();
     if (data) startTransition(() => setPrices(data));
   }, []);

  const refreshAll = useCallback(async () => {
     startTransition(() => setIsLoading(true));
     await Promise.all([refreshWallet(), fetchPrices()]);
     startTransition(() => setIsLoading(false));
   }, [refreshWallet, fetchPrices]);

   // 인증 상태 변경 시 데이터 로드
   useEffect(() => {
     if (isAuthenticated) {
       refreshAll();
     } else {
       // 로그아웃 시 초기화
      startTransition(() => {
        setWallet(null);
        setWalletError(null);
        setIsLoading(false);
      });
     }
   }, [isAuthenticated, refreshAll]);

   useEffect(() => {
     if (typeof window === 'undefined') return;

     const handleWalletRefreshNeeded = () => {
       if (!isAuthenticated) return;
       void refreshWallet();
     };

     window.addEventListener('wallet:refresh-needed', handleWalletRefreshNeeded);
     return () => {
       window.removeEventListener('wallet:refresh-needed', handleWalletRefreshNeeded);
     };
   }, [isAuthenticated, refreshWallet]);

   // 가격 정보는 항상 로드
   useEffect(() => {
     fetchPrices();
   }, [fetchPrices]);

  const canUseFeature = useCallback(
    (featureKey: string) => {
      const DEFAULT_PRICES: Record<string, number> = {
        reading_reanalyze: 150,
        ai_chat: 10,
        ai_chat_followup: 10,
        saju_image: 50,
        compatibility: 50,
        flow_ai_advice: 20,
        daily_fortune_price: 20,
      };

      const price = prices?.[featureKey] ?? DEFAULT_PRICES[featureKey] ?? 0;
      const canUse = wallet ? wallet.balance >= price : false;

      return { canUse, price };
    },
    [wallet, prices]
  );

  return (
    <PaymentContext.Provider
      value={{
        wallet,
        walletError,
        prices,
        isLoading,
        refreshWallet,
        applyWalletBalance,
        refreshAll,
        canUseFeature,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
}

export function usePayment() {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within PaymentProvider');
  }
  return context;
}
