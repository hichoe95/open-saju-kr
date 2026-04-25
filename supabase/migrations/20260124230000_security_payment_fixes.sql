-- ============================================
-- P0 보안 및 결제 무결성 강화 마이그레이션
-- 2026-01-24
-- ============================================

-- ===========================================
-- 1. saju_cache RLS 수정 (P0-1)
-- 기존: SELECT USING(true) - 모든 데이터 공개 읽기 (위험!)
-- 변경: Service Role만 접근 가능 (백엔드 전용)
-- ===========================================

-- 기존 정책 제거
DROP POLICY IF EXISTS "saju_cache_select_all" ON public.saju_cache;
DROP POLICY IF EXISTS "saju_cache_select_by_key" ON public.saju_cache;

-- 새 정책: anon/authenticated 사용자는 직접 조회 불가
-- 백엔드는 Service Role Key를 사용하므로 RLS 우회됨
-- 이로써 클라이언트 직접 접근 완전 차단
CREATE POLICY "saju_cache_service_only" ON public.saju_cache
  FOR SELECT USING (false);

-- 참고: INSERT/UPDATE/DELETE는 정책 없음 (기본 거부)
-- 백엔드만 Service Role로 접근 가능


-- ===========================================
-- 2. shared_saju RLS 강화 (P0-1 관련)
-- 기존 UPDATE 정책이 너무 관대함
-- ===========================================

DROP POLICY IF EXISTS "shared_saju_update_view_count" ON public.shared_saju;

-- view_count 업데이트만 허용하는 정책은 RLS로 직접 제어 불가
-- 대신 백엔드에서만 업데이트하도록 제한 (Service Role)
-- 익명 사용자 UPDATE 완전 차단
CREATE POLICY "shared_saju_update_service_only" ON public.shared_saju
  FOR UPDATE USING (false);


-- ===========================================
-- 3. 탭 해제 원자화 RPC (P0-4)
-- 레이스 컨디션 방지: INSERT 먼저 시도 → 성공 시에만 차감
-- ===========================================

CREATE OR REPLACE FUNCTION unlock_feature(
    p_user_id UUID,
    p_feature_key TEXT,
    p_price INT,
    p_profile_id UUID DEFAULT NULL,  -- P1-1: 사주별 귀속 지원
    p_description TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN, 
    already_unlocked BOOLEAN, 
    transaction_id UUID,
    new_balance INT,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_id UUID;
    v_current_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
    v_desc TEXT;
BEGIN
    -- 설명 기본값 설정
    v_desc := COALESCE(p_description, p_feature_key || ' 해제');
    
    -- 1. 이미 해제되었는지 확인 (profile_id 고려)
    -- profile_id가 NULL이면 전역 해제로 간주
    IF p_profile_id IS NOT NULL THEN
        -- 사주별 해제: 정확히 일치하는 것만 확인
        SELECT id INTO v_existing_id
        FROM user_unlocks
        WHERE user_id = p_user_id 
          AND feature_key = p_feature_key
          AND profile_id = p_profile_id;
    ELSE
        -- 전역 해제: profile_id가 NULL인 것만 확인
        SELECT id INTO v_existing_id
        FROM user_unlocks
        WHERE user_id = p_user_id 
          AND feature_key = p_feature_key
          AND profile_id IS NULL;
    END IF;
    
    IF v_existing_id IS NOT NULL THEN
        -- 이미 해제됨 - 차감 없이 성공 반환
        RETURN QUERY SELECT TRUE, TRUE, NULL::UUID, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;
    
    -- 2. 잔액 확인 (FOR UPDATE 락)
    SELECT balance INTO v_current_balance
    FROM user_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF v_current_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::UUID, NULL::INT, 
            'WALLET_NOT_FOUND: 지갑이 없습니다. 먼저 충전해주세요.'::TEXT;
        RETURN;
    END IF;
    
    IF v_current_balance < p_price THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::UUID, NULL::INT, 
            format('INSUFFICIENT_BALANCE: 엽전이 부족합니다. (필요: %s, 보유: %s)', p_price, v_current_balance)::TEXT;
        RETURN;
    END IF;
    
    -- 3. 해제 레코드 삽입 시도 (UNIQUE 제약으로 동시 요청 중 하나만 성공)
    BEGIN
        INSERT INTO user_unlocks (user_id, feature_key, profile_id)
        VALUES (p_user_id, p_feature_key, p_profile_id);
    EXCEPTION WHEN unique_violation THEN
        -- 동시 요청 중 다른 요청이 먼저 성공
        RETURN QUERY SELECT TRUE, TRUE, NULL::UUID, NULL::INT, NULL::TEXT;
        RETURN;
    END;
    
    -- 4. INSERT 성공 → 코인 차감
    v_new_balance := v_current_balance - p_price;
    
    UPDATE user_wallets
    SET 
        balance = v_new_balance,
        total_spent = total_spent + p_price,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- 5. 거래 기록
    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id, 'spend', -p_price, v_new_balance, v_desc, p_feature_key, NULL
    ) RETURNING id INTO v_tx_id;
    
    -- 6. 해제 레코드에 transaction_id 업데이트
    UPDATE user_unlocks
    SET transaction_id = v_tx_id
    WHERE user_id = p_user_id 
      AND feature_key = p_feature_key
      AND (
          (p_profile_id IS NULL AND profile_id IS NULL) OR
          (profile_id = p_profile_id)
      );
    
    RETURN QUERY SELECT TRUE, FALSE, v_tx_id, v_new_balance, NULL::TEXT;
END;
$$;


-- ===========================================
-- 4. 유료 기능 결제 및 서비스 실행 원자화 RPC (P0-3)
-- 결제 → 서비스 실패 시 자동 환불 지원
-- ===========================================

CREATE OR REPLACE FUNCTION charge_for_feature(
    p_user_id UUID,
    p_feature_key TEXT,
    p_price INT,
    p_description TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    transaction_id UUID,
    new_balance INT,
    is_free BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
    v_desc TEXT;
    v_free_key TEXT;
BEGIN
    v_desc := COALESCE(p_description, p_feature_key);
    
    -- 1. 무료 혜택 확인 (reading_reanalyze → first_reading, ai_chat → first_ai_chat)
    IF p_feature_key = 'reading_reanalyze' THEN
        v_free_key := 'first_reading';
    ELSIF p_feature_key = 'ai_chat' THEN
        v_free_key := 'first_ai_chat';
    ELSIF p_feature_key = 'flow_ai_advice' THEN
        v_free_key := 'first_flow_advice';
    ELSE
        v_free_key := NULL;
    END IF;
    
    IF v_free_key IS NOT NULL THEN
        -- 원자적 무료 혜택 처리: INSERT 성공 여부로 판단 (레이스 컨디션 방지)
        -- ON CONFLICT DO NOTHING 후 ROW_COUNT로 실제 삽입 여부 확인
        INSERT INTO user_free_usage (user_id, feature_key)
        VALUES (p_user_id, v_free_key)
        ON CONFLICT DO NOTHING;
        
        -- GET DIAGNOSTICS로 실제 삽입 행 수 확인
        GET DIAGNOSTICS v_current_balance = ROW_COUNT;  -- 변수 재사용 (INT 타입)
        
        IF v_current_balance > 0 THEN
            -- INSERT 성공 = 첫 무료 사용
            RETURN QUERY SELECT TRUE, NULL::UUID, NULL::INT, TRUE, NULL::TEXT;
            RETURN;
        END IF;
        -- INSERT 실패 (이미 존재) = 무료 혜택 소진, 유료 결제 진행
    END IF;
    
    -- 2. 잔액 확인 (FOR UPDATE 락)
    SELECT balance INTO v_current_balance
    FROM user_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF v_current_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INT, FALSE,
            'WALLET_NOT_FOUND: 지갑이 없습니다. 먼저 충전해주세요.'::TEXT;
        RETURN;
    END IF;
    
    IF v_current_balance < p_price THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INT, FALSE,
            format('INSUFFICIENT_BALANCE: 엽전이 부족합니다. (필요: %s, 보유: %s)', p_price, v_current_balance)::TEXT;
        RETURN;
    END IF;
    
    -- 3. 코인 차감
    v_new_balance := v_current_balance - p_price;
    
    UPDATE user_wallets
    SET 
        balance = v_new_balance,
        total_spent = total_spent + p_price,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- 4. 거래 기록
    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id, 'spend', -p_price, v_new_balance, v_desc, p_feature_key, p_reference_id
    ) RETURNING id INTO v_tx_id;
    
    RETURN QUERY SELECT TRUE, v_tx_id, v_new_balance, FALSE, NULL::TEXT;
END;
$$;


-- ===========================================
-- 5. user_unlocks 테이블에 profile_id 컬럼 추가 (P1-1 준비)
-- 사주별 탭 귀속 지원
-- ===========================================

-- profile_id 컬럼 추가 (없는 경우에만)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'user_unlocks' 
          AND column_name = 'profile_id'
    ) THEN
        ALTER TABLE public.user_unlocks 
        ADD COLUMN profile_id UUID REFERENCES saju_profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 기존 UNIQUE 제약 수정: profile_id 포함
-- 먼저 기존 제약 삭제 시도
ALTER TABLE public.user_unlocks
DROP CONSTRAINT IF EXISTS user_unlocks_unique;

-- 새 제약 추가: (user_id, feature_key, profile_id) 조합이 유니크
-- profile_id가 NULL인 경우는 전역 해제로 간주 (기존 데이터 호환)
CREATE UNIQUE INDEX IF NOT EXISTS user_unlocks_unique_with_profile
ON public.user_unlocks (user_id, feature_key, COALESCE(profile_id, '00000000-0000-0000-0000-000000000000'::UUID));


-- ===========================================
-- 6. 기운 캘린더 AI 조언 저장 테이블 (P1-2 준비)
-- ===========================================

CREATE TABLE IF NOT EXISTS public.user_flow_advices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES saju_profiles(id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    advice_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 같은 프로필, 같은 날짜, 같은 카테고리에 하나의 조언만
    CONSTRAINT user_flow_advices_unique 
        UNIQUE (user_id, profile_id, target_date, category)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_flow_advices_user_profile
ON public.user_flow_advices (user_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_user_flow_advices_date
ON public.user_flow_advices (target_date);

-- RLS 활성화
ALTER TABLE public.user_flow_advices ENABLE ROW LEVEL SECURITY;

-- 사용자 본인 데이터만 접근
CREATE POLICY "user_flow_advices_select_own" ON public.user_flow_advices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_flow_advices_insert_own" ON public.user_flow_advices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_flow_advices_update_own" ON public.user_flow_advices
  FOR UPDATE USING (auth.uid() = user_id);


-- ===========================================
-- 7. RPC 권한 설정
-- ===========================================

REVOKE ALL ON FUNCTION unlock_feature FROM PUBLIC;
REVOKE ALL ON FUNCTION charge_for_feature FROM PUBLIC;

GRANT EXECUTE ON FUNCTION unlock_feature TO service_role;
GRANT EXECUTE ON FUNCTION charge_for_feature TO service_role;


-- ===========================================
-- 8. flow_ai_advice 무료 사용 지원
-- ===========================================

-- user_free_usage에 first_flow_advice 추가 가능하도록 (이미 generic하게 설계됨)
-- 별도 스키마 변경 불필요
