-- ============================================
-- Phase 1 Security Fixes
-- P1-CRITICAL: RLS 취약점 수정 + 민감 테이블 RLS ENABLE 보장
-- ============================================

-- ===========================================
-- 1. user_feedbacks INSERT 정책 취약점 수정
-- 기존: WITH CHECK (auth.uid()::text = user_id::text OR user_id IS NOT NULL)
-- 문제: user_id IS NOT NULL이 항상 true (NOT NULL 컬럼)
-- 수정: 본인 user_id로만 INSERT 가능
-- ===========================================

DROP POLICY IF EXISTS "Users can insert own feedback" ON user_feedbacks;

CREATE POLICY "feedbacks_insert_own" ON user_feedbacks
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (select auth.uid()));


-- ===========================================
-- 2. 민감 테이블 RLS ENABLE 보장 (idempotent)
-- 정책은 이미 존재하나 ENABLE이 누락되었을 수 있음
-- ===========================================

DO $$ 
BEGIN
    -- users 테이블
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'users' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'Enabled RLS on public.users';
    END IF;

    -- user_identities 테이블
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'user_identities' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'Enabled RLS on public.user_identities';
    END IF;

    -- user_wallets 테이블
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'user_wallets' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'Enabled RLS on public.user_wallets';
    END IF;

    -- coin_transactions 테이블
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'coin_transactions' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'Enabled RLS on public.coin_transactions';
    END IF;

    -- payments 테이블
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'payments' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'Enabled RLS on public.payments';
    END IF;
END $$;


-- ===========================================
-- 3. Admin RPC: search_path 보안 강화
-- SECURITY DEFINER 함수에 SET search_path 추가
-- ===========================================

CREATE OR REPLACE FUNCTION admin_adjust_coins(
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_admin_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance INT, transaction_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_balance INT;
    v_tx_id UUID;
    v_description TEXT;
BEGIN
    IF p_amount = 0 THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '조정 금액은 0이 아니어야 합니다'::TEXT;
        RETURN;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id
        FROM coin_transactions
        WHERE reference_type = 'admin_adjustment'
          AND reference_id = p_idempotency_key
        LIMIT 1;
        
        IF v_tx_id IS NOT NULL THEN
            SELECT balance INTO v_new_balance
            FROM user_wallets
            WHERE user_id = p_user_id;
            
            RETURN QUERY SELECT TRUE, COALESCE(v_new_balance, 0), v_tx_id, '이미 처리된 요청입니다 (멱등성)'::TEXT;
            RETURN;
        END IF;
    END IF;

    v_description := format('[관리자 조정] %s (by admin:%s)', p_reason, p_admin_id::text);

    SELECT balance INTO v_new_balance
    FROM user_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_new_balance IS NULL THEN
        IF p_amount > 0 THEN
            INSERT INTO user_wallets (user_id, balance, total_charged, total_spent)
            VALUES (p_user_id, p_amount, 0, 0)
            RETURNING balance INTO v_new_balance;
        ELSE
            RETURN QUERY SELECT FALSE, 0, NULL::UUID, '지갑이 없습니다'::TEXT;
            RETURN;
        END IF;
    ELSE
        IF v_new_balance + p_amount < 0 THEN
            RETURN QUERY SELECT FALSE, v_new_balance, NULL::UUID, format('잔액 부족 (현재: %s, 조정: %s)', v_new_balance, p_amount)::TEXT;
            RETURN;
        END IF;

        UPDATE user_wallets
        SET balance = balance + p_amount,
            total_charged = CASE WHEN p_amount > 0 THEN total_charged + p_amount ELSE total_charged END,
            total_spent = CASE WHEN p_amount < 0 THEN total_spent + ABS(p_amount) ELSE total_spent END,
            updated_at = NOW()
        WHERE user_id = p_user_id
        RETURNING balance INTO v_new_balance;
    END IF;

    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id,
        CASE WHEN p_amount > 0 THEN 'admin_credit' ELSE 'admin_debit' END,
        p_amount,
        v_new_balance,
        v_description,
        'admin_adjustment',
        p_idempotency_key
    ) RETURNING id INTO v_tx_id;

    INSERT INTO admin_audit_logs (admin_id, action, target_user_id, details)
    VALUES (p_admin_id, 'coin_adjustment', p_user_id, jsonb_build_object(
        'amount', p_amount,
        'reason', p_reason,
        'new_balance', v_new_balance,
        'transaction_id', v_tx_id,
        'idempotency_key', p_idempotency_key
    ));

    RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, '성공'::TEXT;
END;
$$;


CREATE OR REPLACE FUNCTION admin_refund_coins(
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_admin_id UUID,
    p_original_tx_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance INT, refund_tx_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_balance INT;
    v_tx_id UUID;
    v_existing_refund UUID;
BEGIN
    IF p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '환불 금액은 0보다 커야 합니다'::TEXT;
        RETURN;
    END IF;

    IF p_original_tx_id IS NOT NULL THEN
        SELECT id INTO v_existing_refund
        FROM coin_transactions
        WHERE type = 'refund' AND reference_id = p_original_tx_id
        LIMIT 1;
        
        IF v_existing_refund IS NOT NULL THEN
            SELECT balance INTO v_new_balance
            FROM user_wallets
            WHERE user_id = p_user_id;
            
            RETURN QUERY SELECT TRUE, COALESCE(v_new_balance, 0), v_existing_refund, '이미 환불된 거래입니다'::TEXT;
            RETURN;
        END IF;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_refund
        FROM coin_transactions
        WHERE reference_type = 'admin_refund'
          AND reference_id = p_idempotency_key
        LIMIT 1;
        
        IF v_existing_refund IS NOT NULL THEN
            SELECT balance INTO v_new_balance
            FROM user_wallets
            WHERE user_id = p_user_id;
            
            RETURN QUERY SELECT TRUE, COALESCE(v_new_balance, 0), v_existing_refund, '이미 처리된 요청입니다 (멱등성)'::TEXT;
            RETURN;
        END IF;
    END IF;

    UPDATE user_wallets
    SET balance = balance + p_amount,
        total_spent = GREATEST(0, total_spent - p_amount),
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '지갑을 찾을 수 없습니다'::TEXT;
        RETURN;
    END IF;

    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id,
        'admin_refund',
        p_amount,
        v_new_balance,
        format('[관리자 환불] %s (by admin:%s)', p_reason, p_admin_id::text),
        CASE WHEN p_idempotency_key IS NOT NULL THEN 'admin_refund' ELSE 'refund' END,
        COALESCE(p_idempotency_key, p_original_tx_id::text)
    ) RETURNING id INTO v_tx_id;

    INSERT INTO admin_audit_logs (admin_id, action, target_user_id, details)
    VALUES (p_admin_id, 'coin_refund', p_user_id, jsonb_build_object(
        'amount', p_amount,
        'reason', p_reason,
        'original_tx_id', p_original_tx_id,
        'new_balance', v_new_balance,
        'refund_tx_id', v_tx_id,
        'idempotency_key', p_idempotency_key
    ));

    RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, '성공'::TEXT;
END;
$$;


-- ===========================================
-- 4. RPC 권한 설정 (기존과 동일하게 service_role만 허용)
-- ===========================================

REVOKE ALL ON FUNCTION admin_adjust_coins FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_refund_coins FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_adjust_coins TO service_role;
GRANT EXECUTE ON FUNCTION admin_refund_coins TO service_role;
