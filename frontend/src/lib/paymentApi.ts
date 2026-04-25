// 결제 API 클라이언트

import {
  Wallet,
  CoinProduct,
  Transaction,
  FeaturePrices,
  PaymentPrepareResponse,
  SpendResponse,
} from '@/types/payment';
import { API_BASE_URL } from '@/lib/apiBase';
import { authFetchWithRefresh, buildClientAuthHeaders } from '@/utils/authToken';

const getAuthHeaders = () => {
  return {
    'Content-Type': 'application/json',
    ...buildClientAuthHeaders(),
  };
};

const authFetch = (url: string, init: RequestInit = {}) => fetch(url, {
  ...init,
  credentials: 'include',
});

export class PaymentApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PaymentApiError';
    this.status = status;
  }
}

async function parseErrorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return fallback;
    }
    const error = await res.json();
    if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') {
      return error.detail;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

async function getProtectedErrorMessage(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) {
    return '로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.';
  }

  return parseErrorDetail(res, fallback);
}

// 지갑 조회
export async function getWallet(): Promise<Wallet | null> {
  try {
    const res = await authFetchWithRefresh(`${API_BASE_URL}/api/payment/wallet`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new PaymentApiError(
        await getProtectedErrorMessage(res, '지갑 정보를 불러오지 못했습니다.'),
        res.status,
      );
    }
    return await res.json();
  } catch (e) {
    if (e instanceof PaymentApiError) {
      throw e;
    }

    if (e instanceof TypeError) {
      throw new PaymentApiError('지갑 정보를 불러오는 중 네트워크 오류가 발생했습니다.', 0);
    }

    throw new PaymentApiError('지갑 정보를 불러오지 못했습니다.', 0);
  }
}

export async function getPaymentConfig(): Promise<{ client_key: string; mode: string } | null> {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/payment/config`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getProducts(): Promise<CoinProduct[]> {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/payment/products`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// 거래 내역 조회
export async function getTransactions(
  limit: number = 20,
  offset: number = 0
): Promise<Transaction[]> {
  try {
    const res = await authFetchWithRefresh(
      `${API_BASE_URL}/api/payment/transactions?limit=${limit}&offset=${offset}`,
      { headers: getAuthHeaders() }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// 결제 준비
export async function preparePayment(
  productId: string
): Promise<PaymentPrepareResponse | null> {
  try {
    const res = await authFetchWithRefresh(`${API_BASE_URL}/api/payment/prepare`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ product_id: productId }),
      mode: 'cors',
    });
    if (!res.ok) {
      throw new Error(await getProtectedErrorMessage(res, '결제 준비 실패'));
    }
    return await res.json();
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error('서버에 연결할 수 없습니다. 네트워크를 확인해주세요.');
    }
    throw e;
  }
}

// 결제 승인
export async function confirmPayment(
  paymentKey: string,
  orderId: string,
  amount: number
): Promise<{ success: boolean; balance: number; charged: number }> {
  try {
    const res = await authFetchWithRefresh(`${API_BASE_URL}/api/payment/confirm`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        payment_key: paymentKey,
        order_id: orderId,
        amount,
      }),
    });

    if (!res.ok) {
      throw new Error(await getProtectedErrorMessage(res, '결제 승인 실패'));
    }

    return await res.json();
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error('결제 승인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
    throw e;
  }
}

// 엽전 사용
export async function spendCoins(
  featureKey: string,
  referenceId?: string,
  idempotencyKey?: string
): Promise<SpendResponse> {
  try {
    const res = await authFetchWithRefresh(`${API_BASE_URL}/api/payment/spend`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        feature_key: featureKey,
        reference_id: referenceId,
        ...(idempotencyKey && { idempotency_key: idempotencyKey }),
      }),
    });

    if (!res.ok) {
      throw new Error(await getProtectedErrorMessage(res, '엽전 사용 실패'));
    }

    return await res.json();
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error('결제 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
    throw e;
  }
}

export async function getPrices(): Promise<FeaturePrices | null> {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/payment/prices`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface WalletExpiration {
  total_balance: number;
  valid_balance: number;
  expired_balance: number;
  expiring_soon_balance: number;
  expiring_soon_date: string | null;
}

export async function getWalletExpiration(): Promise<WalletExpiration | null> {
  try {
    const res = await authFetchWithRefresh(`${API_BASE_URL}/api/payment/wallet/expiration`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
