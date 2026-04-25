// 결제 시스템 타입 정의

export interface Wallet {
  balance: number;
  total_charged: number;
  total_spent: number;
}

export interface CoinProduct {
  id: string;
  name: string;
  coin_amount: number;
  price: number;
  bonus_amount: number;
}

export interface Transaction {
  id: string;
  type: 'charge' | 'spend' | 'refund' | 'bonus';
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

export interface FeaturePrices {
  reading_reanalyze: number;
  ai_chat: number;
  ai_chat_followup: number;
  saju_image: number;
  compatibility: number;
  flow_ai_advice: number;
  daily_fortune_price: number;
  [key: string]: number;
}

export interface PaymentPrepareResponse {
  order_id: string;
  amount: number;
  order_name: string;
  customer_name?: string;
  customer_email?: string;
  client_key: string;
  payment_mode: 'test' | 'live';
}

export interface SpendResponse {
  success: boolean;
  free?: boolean;
  all_tabs_included?: boolean;
  already_unlocked?: boolean;
  balance?: number;
  spent?: number;
  transaction_id?: string;
}

declare global {
  interface Window {
    TossPayments: (clientKey: string) => TossPaymentsSDK;
  }
}

export interface TossPaymentsSDK {
  payment: (options: { customerKey: string }) => TossPaymentInstance;
  widgets: (options: { customerKey: string }) => TossWidgetsInstance;
}

export interface TossPaymentInstance {
  requestPayment: (options: TossPaymentRequestOptions) => Promise<void>;
}

export interface TossWidgetsInstance {
  setAmount: (amount: { currency: string; value: number }) => Promise<void>;
  renderPaymentMethods: (options: { selector: string; variantKey: string }) => Promise<void>;
  renderAgreement: (options: { selector: string; variantKey: string }) => Promise<void>;
  requestPayment: (options: TossWidgetPaymentOptions) => Promise<void>;
}

export interface TossPaymentRequestOptions {
  method: 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'MOBILE_PHONE' | 'GIFT_CERTIFICATE' | 'FOREIGN_EASY_PAY';
  amount: {
    currency: string;
    value: number;
  };
  orderId: string;
  orderName: string;
  customerName?: string;
  customerEmail?: string;
  customerMobilePhone?: string;
  successUrl: string;
  failUrl: string;
  card?: {
    useEscrow?: boolean;
    flowMode?: 'DEFAULT' | 'DIRECT';
    useCardPoint?: boolean;
    useAppCardOnly?: boolean;
    useInternationalCardOnly?: boolean;
  };
  transfer?: {
    cashReceipt?: {
      type: '소득공제' | '지출증빙';
    };
    useEscrow?: boolean;
  };
}

export interface TossWidgetPaymentOptions {
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerEmail?: string;
  customerName?: string;
  customerMobilePhone?: string;
}
