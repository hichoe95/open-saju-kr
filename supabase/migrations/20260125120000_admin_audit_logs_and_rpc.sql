-- Admin Dashboard 고급 기능을 위한 마이그레이션
-- 1. admin_audit_logs 테이블 생성 (감사 로그)
-- 2. admin_adjust_coins RPC 함수 (원자적 잔액 조정)
-- 3. admin_refund_coins RPC 함수 (원자적 환불 처리)

-- ============================================================
-- 1. admin_audit_logs 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.users(id),
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    reason TEXT,
    before_data JSONB,
    after_data JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.admin_audit_logs IS '관리자 작업 감사 로그';
COMMENT ON COLUMN public.admin_audit_logs.action IS '수행된 작업 (adjust_balance, refund, update_config 등)';
COMMENT ON COLUMN public.admin_audit_logs.target_type IS '대상 타입 (user, payment, config 등)';
COMMENT ON COLUMN public.admin_audit_logs.target_id IS '대상 ID';
COMMENT ON COLUMN public.admin_audit_logs.before_data IS '변경 전 데이터';
COMMENT ON COLUMN public.admin_audit_logs.after_data IS '변경 후 데이터';

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.admin_audit_logs(action);

-- RLS 활성화 (관리자만 접근)
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_audit_logs_admin_only" ON public.admin_audit_logs
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- ============================================================
-- 2. admin_adjust_coins RPC 함수
-- ============================================================
CREATE OR REPLACE FUNCTION admin_adjust_coins(
    p_admin_id UUID,
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    previous_balance INT,
    new_balance INT,
    transaction_id UUID,
    error_message TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prev_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
    v_wallet_exists BOOLEAN;
BEGIN
    -- 멱등성 체크 (동일한 idempotency_key로 중복 요청 방지)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT ct.id INTO v_tx_id
        FROM coin_transactions ct
        WHERE ct.description LIKE '%' || p_idempotency_key || '%'
        LIMIT 1;
        
        IF v_tx_id IS NOT NULL THEN
            -- 이미 처리된 요청
            SELECT w.balance INTO v_new_balance
            FROM user_wallets w WHERE w.user_id = p_user_id;
            
            RETURN QUERY SELECT 
                TRUE, 
                v_new_balance, 
                v_new_balance, 
                v_tx_id, 
                NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- 금액 검증
    IF p_amount = 0 THEN
        RETURN QUERY SELECT FALSE, 0, 0, NULL::UUID, 'ZERO_AMOUNT'::TEXT;
        RETURN;
    END IF;
    
    IF ABS(p_amount) > 10000 THEN
        RETURN QUERY SELECT FALSE, 0, 0, NULL::UUID, 'AMOUNT_LIMIT_EXCEEDED'::TEXT;
        RETURN;
    END IF;

    -- 지갑 조회 (FOR UPDATE 락)
    SELECT w.balance, TRUE INTO v_prev_balance, v_wallet_exists
    FROM user_wallets w
    WHERE w.user_id = p_user_id
    FOR UPDATE;
    
    IF NOT v_wallet_exists THEN
        -- 지갑이 없으면 생성
        INSERT INTO user_wallets (user_id, balance, total_charged, total_spent)
        VALUES (p_user_id, 0, 0, 0)
        ON CONFLICT (user_id) DO NOTHING;
        
        v_prev_balance := 0;
    END IF;
    
    -- 차감 시 잔액 검증
    IF p_amount < 0 AND (v_prev_balance + p_amount) < 0 THEN
        RETURN QUERY SELECT FALSE, v_prev_balance, v_prev_balance, NULL::UUID, 'INSUFFICIENT_BALANCE'::TEXT;
        RETURN;
    END IF;
    
    -- 잔액 업데이트
    v_new_balance := v_prev_balance + p_amount;
    
    UPDATE user_wallets
    SET 
        balance = v_new_balance,
        total_charged = CASE WHEN p_amount > 0 THEN total_charged + p_amount ELSE total_charged END,
        total_spent = CASE WHEN p_amount < 0 THEN total_spent + ABS(p_amount) ELSE total_spent END,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- 거래 기록
    INSERT INTO coin_transactions (
        user_id, 
        type, 
        amount, 
        description, 
        reference_type, 
        reference_id
    ) VALUES (
        p_user_id,
        CASE WHEN p_amount > 0 THEN 'admin_credit' ELSE 'admin_debit' END,
        p_amount,
        p_reason || COALESCE(' [key:' || p_idempotency_key || ']', ''),
        'admin_adjustment',
        p_admin_id::TEXT
    ) RETURNING id INTO v_tx_id;
    
    RETURN QUERY SELECT TRUE, v_prev_balance, v_new_balance, v_tx_id, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION admin_adjust_coins IS '관리자 잔액 조정 (원자적, 멱등성 보장)';

-- ============================================================
-- 3. admin_refund_coins RPC 함수
-- ============================================================
CREATE OR REPLACE FUNCTION admin_refund_coins(
    p_admin_id UUID,
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_original_tx_id UUID DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    previous_balance INT,
    new_balance INT,
    refund_tx_id UUID,
    error_message TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prev_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
    v_already_refunded BOOLEAN;
BEGIN
    -- 금액 검증
    IF p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 0, 0, NULL::UUID, 'INVALID_AMOUNT'::TEXT;
        RETURN;
    END IF;
    
    IF p_amount > 10000 THEN
        RETURN QUERY SELECT FALSE, 0, 0, NULL::UUID, 'AMOUNT_LIMIT_EXCEEDED'::TEXT;
        RETURN;
    END IF;
    
    -- 중복 환불 체크
    IF p_original_tx_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM coin_transactions
            WHERE reference_id = p_original_tx_id::TEXT
            AND type = 'admin_refund'
        ) INTO v_already_refunded;
        
        IF v_already_refunded THEN
            RETURN QUERY SELECT FALSE, 0, 0, NULL::UUID, 'ALREADY_REFUNDED'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- 지갑 조회 (FOR UPDATE 락)
    SELECT w.balance INTO v_prev_balance
    FROM user_wallets w
    WHERE w.user_id = p_user_id
    FOR UPDATE;
    
    IF v_prev_balance IS NULL THEN
        -- 지갑이 없으면 생성
        INSERT INTO user_wallets (user_id, balance, total_charged, total_spent)
        VALUES (p_user_id, 0, 0, 0)
        ON CONFLICT (user_id) DO NOTHING;
        
        v_prev_balance := 0;
    END IF;
    
    -- 잔액 업데이트
    v_new_balance := v_prev_balance + p_amount;
    
    UPDATE user_wallets
    SET 
        balance = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- 환불 거래 기록
    INSERT INTO coin_transactions (
        user_id, 
        type, 
        amount, 
        description, 
        reference_type, 
        reference_id
    ) VALUES (
        p_user_id,
        'admin_refund',
        p_amount,
        '[관리자 환불] ' || p_reason,
        'admin_refund',
        COALESCE(p_original_tx_id::TEXT, p_admin_id::TEXT)
    ) RETURNING id INTO v_tx_id;
    
    RETURN QUERY SELECT TRUE, v_prev_balance, v_new_balance, v_tx_id, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION admin_refund_coins IS '관리자 환불 처리 (원자적, 중복 환불 방지)';

-- ============================================================
-- 4. 권한 설정
-- ============================================================
REVOKE ALL ON FUNCTION admin_adjust_coins FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_refund_coins FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_adjust_coins TO service_role;
GRANT EXECUTE ON FUNCTION admin_refund_coins TO service_role;
