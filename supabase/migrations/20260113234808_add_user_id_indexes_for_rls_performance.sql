-- ============================================
-- RLS 성능 최적화를 위한 인덱스 추가
--
-- user_id 컬럼에 인덱스를 추가하여 RLS 정책의
-- (user_id = (select auth.uid())) 조건 검사 성능 향상
--
-- 참고: 일부 테이블은 이미 인덱스가 있으므로
-- 아래 테이블들만 추가함
-- ============================================

-- saju_profiles: user_id 인덱스
CREATE INDEX IF NOT EXISTS idx_saju_profiles_user_id
  ON public.saju_profiles(user_id);

-- user_consents: user_id 인덱스
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id
  ON public.user_consents(user_id);

-- user_identities: user_id 인덱스
CREATE INDEX IF NOT EXISTS idx_user_identities_user_id
  ON public.user_identities(user_id);

-- user_unlocks: transaction_id 인덱스 (user_id는 idx_unlock_user로 이미 있음)
CREATE INDEX IF NOT EXISTS idx_user_unlocks_transaction_id
  ON public.user_unlocks(transaction_id);

-- user_readings: user_id 인덱스
CREATE INDEX IF NOT EXISTS idx_user_readings_user_id
  ON public.user_readings(user_id);

-- ============================================
-- 이미 존재하는 인덱스 (추가 불필요):
-- - coin_transactions: idx_transaction_user
-- - payments: idx_payment_user
-- - user_wallets: idx_wallet_user
-- - user_free_usage: idx_free_usage_user
-- - user_unlocks: idx_unlock_user
-- ============================================
