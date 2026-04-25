-- ============================================
-- 보안 강화 마이그레이션
-- 위험한 RLS 정책 제거 및 적절한 정책으로 교체
-- ============================================

-- 1. coin_products: RLS 활성화 + 모두 SELECT 허용
ALTER TABLE public.coin_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coin_products_select_all" ON public.coin_products
  FOR SELECT USING (true);

-- 2. 위험한 service 정책들 삭제
DROP POLICY IF EXISTS "transaction_service_policy" ON public.coin_transactions;
DROP POLICY IF EXISTS "payment_service_policy" ON public.payments;
DROP POLICY IF EXISTS "wallet_service_policy" ON public.user_wallets;
DROP POLICY IF EXISTS "unlock_service_policy" ON public.user_unlocks;
DROP POLICY IF EXISTS "free_usage_service_policy" ON public.user_free_usage;
DROP POLICY IF EXISTS "saju_cache_insert_service" ON public.saju_cache;
DROP POLICY IF EXISTS "saju_cache_update_service" ON public.saju_cache;
DROP POLICY IF EXISTS "users_insert_service" ON public.users;
DROP POLICY IF EXISTS "identities_insert_service" ON public.user_identities;

-- 3. 사용자별 SELECT 정책 추가 (본인 데이터만 조회 가능)
CREATE POLICY "coin_transactions_select_own" ON public.coin_transactions
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "user_wallets_select_own" ON public.user_wallets
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "user_unlocks_select_own" ON public.user_unlocks
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "user_free_usage_select_own" ON public.user_free_usage
  FOR SELECT USING (user_id = (select auth.uid()));

-- 4. shared_saju 정책 수정
DROP POLICY IF EXISTS "Authenticated users can create shared_saju" ON public.shared_saju;
DROP POLICY IF EXISTS "Allow update view_count" ON public.shared_saju;

-- 인증된 사용자만 자신의 공유 생성 가능
CREATE POLICY "shared_saju_insert_authenticated" ON public.shared_saju
  FOR INSERT WITH CHECK (
    (select auth.role()) = 'authenticated' AND user_id = (select auth.uid())
  );

-- view_count 업데이트는 누구나 가능 (조회수 증가용)
CREATE POLICY "shared_saju_update_view_count" ON public.shared_saju
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- 5. 기존 정책 성능 최적화 (auth.uid() -> (select auth.uid()))
-- users 테이블
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (id = (select auth.uid()));

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (id = (select auth.uid()));

-- user_identities 테이블
DROP POLICY IF EXISTS "identities_select_own" ON public.user_identities;
DROP POLICY IF EXISTS "identities_update_own" ON public.user_identities;

CREATE POLICY "identities_select_own" ON public.user_identities
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "identities_update_own" ON public.user_identities
  FOR UPDATE USING (user_id = (select auth.uid()));

-- user_consents 테이블
DROP POLICY IF EXISTS "consents_select_own" ON public.user_consents;
DROP POLICY IF EXISTS "consents_insert_own" ON public.user_consents;
DROP POLICY IF EXISTS "consents_update_own" ON public.user_consents;

CREATE POLICY "consents_select_own" ON public.user_consents
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "consents_insert_own" ON public.user_consents
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "consents_update_own" ON public.user_consents
  FOR UPDATE USING (user_id = (select auth.uid()));

-- saju_profiles 테이블
DROP POLICY IF EXISTS "profiles_select_own" ON public.saju_profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.saju_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.saju_profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.saju_profiles;

CREATE POLICY "profiles_select_own" ON public.saju_profiles
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "profiles_insert_own" ON public.saju_profiles
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "profiles_update_own" ON public.saju_profiles
  FOR UPDATE USING (user_id = (select auth.uid()));

CREATE POLICY "profiles_delete_own" ON public.saju_profiles
  FOR DELETE USING (user_id = (select auth.uid()));

-- user_readings 테이블
DROP POLICY IF EXISTS "user_readings_select_own" ON public.user_readings;
DROP POLICY IF EXISTS "user_readings_insert_own" ON public.user_readings;
DROP POLICY IF EXISTS "user_readings_delete_own" ON public.user_readings;

CREATE POLICY "user_readings_select_own" ON public.user_readings
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "user_readings_insert_own" ON public.user_readings
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "user_readings_delete_own" ON public.user_readings
  FOR DELETE USING (user_id = (select auth.uid()));
