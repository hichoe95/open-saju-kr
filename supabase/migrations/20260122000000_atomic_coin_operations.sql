-- ============================================
-- 결제 시스템 원자성 + 보안 강화 마이그레이션
-- ============================================

-- ===========================================
-- 1. UNIQUE 제약 추가 (레이스 컨디션 방지)
-- ===========================================

-- 중복 지갑 방지
ALTER TABLE public.user_wallets
ADD CONSTRAINT user_wallets_user_id_unique UNIQUE (user_id);

-- 중복 무료 사용 방지
ALTER TABLE public.user_free_usage
ADD CONSTRAINT user_free_usage_unique UNIQUE (user_id, feature_key);

-- 중복 탭 해제 방지
ALTER TABLE public.user_unlocks
ADD CONSTRAINT user_unlocks_unique UNIQUE (user_id, feature_key);

-- 중복 환불 방지 (부분 인덱스: type='refund'인 경우 reference_id 유니크)
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_single_refund
ON public.coin_transactions (reference_id)
WHERE type = 'refund' AND reference_id IS NOT NULL;


-- ===========================================
-- 2. 코인 충전 함수 (UPSERT 패턴 + 보안 강화)
-- ===========================================
CREATE OR REPLACE FUNCTION credit_coins(
    p_user_id UUID,
    p_amount INT,
    p_description TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL
) RETURNS TABLE(new_balance INT, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_balance INT;
    v_tx_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 충전 금액은 0보다 커야 합니다';
    END IF;
    
    IF p_amount > 100000 THEN
        RAISE EXCEPTION 'AMOUNT_LIMIT_EXCEEDED: 1회 최대 충전 한도를 초과했습니다';
    END IF;
    
    INSERT INTO user_wallets (user_id, balance, total_charged, total_spent)
    VALUES (p_user_id, p_amount, p_amount, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET 
        balance = user_wallets.balance + EXCLUDED.balance,
        total_charged = user_wallets.total_charged + p_amount,
        updated_at = NOW()
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id, 'charge', p_amount, v_new_balance, p_description, p_reference_type, p_reference_id
    ) RETURNING id INTO v_tx_id;
    
    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;


-- ===========================================
-- 3. 코인 차감 함수 (FOR UPDATE 락 + 입력 검증)
-- ===========================================
CREATE OR REPLACE FUNCTION debit_coins(
    p_user_id UUID,
    p_amount INT,
    p_description TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL
) RETURNS TABLE(new_balance INT, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 차감 금액은 0보다 커야 합니다';
    END IF;
    
    IF p_amount > 10000 THEN
        RAISE EXCEPTION 'AMOUNT_LIMIT_EXCEEDED: 1회 최대 사용 한도를 초과했습니다';
    END IF;
    
    SELECT balance INTO v_current_balance
    FROM user_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: 지갑이 없습니다. 먼저 충전해주세요.';
    END IF;
    
    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: 엽전이 부족합니다. (필요: %, 보유: %)', p_amount, v_current_balance;
    END IF;
    
    v_new_balance := v_current_balance - p_amount;
    
    UPDATE user_wallets
    SET 
        balance = v_new_balance,
        total_spent = total_spent + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id, 'spend', -p_amount, v_new_balance, p_description, p_reference_type, p_reference_id
    ) RETURNING id INTO v_tx_id;
    
    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;


-- ===========================================
-- 4. 코인 환불 함수 (더블 환불 방지)
-- ===========================================
CREATE OR REPLACE FUNCTION refund_coins(
    p_user_id UUID,
    p_amount INT,
    p_original_tx_id UUID,
    p_reason TEXT DEFAULT '서비스 실패로 인한 환불'
) RETURNS TABLE(new_balance INT, refund_tx_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_balance INT;
    v_tx_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 환불 금액은 0보다 커야 합니다';
    END IF;
    
    UPDATE user_wallets
    SET 
        balance = balance + p_amount,
        total_spent = total_spent - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
    
    IF v_new_balance IS NULL THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: 환불할 지갑을 찾을 수 없습니다.';
    END IF;
    
    BEGIN
        INSERT INTO coin_transactions (
            user_id, type, amount, balance_after, description, reference_type, reference_id
        ) VALUES (
            p_user_id, 'refund', p_amount, v_new_balance, p_reason, 'refund', p_original_tx_id
        ) RETURNING id INTO v_tx_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_REFUNDED: 이미 환불된 거래입니다';
    END;
    
    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;


-- ===========================================
-- 5. 보너스 코인 지급 함수 (UPSERT 패턴)
-- ===========================================
CREATE OR REPLACE FUNCTION grant_bonus_coins(
    p_user_id UUID,
    p_amount INT,
    p_description TEXT,
    p_reference_type TEXT DEFAULT 'bonus'
) RETURNS TABLE(new_balance INT, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_balance INT;
    v_tx_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 보너스 금액은 0보다 커야 합니다';
    END IF;
    
    IF p_amount > 10000 THEN
        RAISE EXCEPTION 'AMOUNT_LIMIT_EXCEEDED: 1회 최대 보너스 한도를 초과했습니다';
    END IF;
    
    INSERT INTO user_wallets (user_id, balance, total_charged, total_spent)
    VALUES (p_user_id, p_amount, 0, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET 
        balance = user_wallets.balance + p_amount,
        updated_at = NOW()
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type
    ) VALUES (
        p_user_id, 'bonus', p_amount, v_new_balance, p_description, p_reference_type
    ) RETURNING id INTO v_tx_id;
    
    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;


-- ===========================================
-- 6. 결제 완료 처리 함수 (멱등성 + Toss 응답 검증)
-- ===========================================
CREATE OR REPLACE FUNCTION complete_payment(
    p_order_id TEXT,
    p_payment_key TEXT,
    p_method TEXT,
    p_approved_at TEXT,
    p_receipt_url TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance INT, coin_amount INT, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment RECORD;
    v_result RECORD;
BEGIN
    SELECT * INTO v_payment
    FROM payments
    WHERE order_id = p_order_id
    FOR UPDATE;
    
    IF v_payment IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, 0, '주문을 찾을 수 없습니다'::TEXT;
        RETURN;
    END IF;
    
    IF v_payment.status = 'done' THEN
        IF v_payment.payment_key = p_payment_key THEN
            SELECT balance INTO v_result
            FROM user_wallets
            WHERE user_id = v_payment.user_id;
            
            RETURN QUERY SELECT TRUE, COALESCE(v_result.balance, 0), v_payment.coin_amount, NULL::TEXT;
            RETURN;
        ELSE
            RETURN QUERY SELECT FALSE, 0, 0, '이미 다른 결제로 처리된 주문입니다'::TEXT;
            RETURN;
        END IF;
    END IF;
    
    IF v_payment.status != 'pending' THEN
        RETURN QUERY SELECT FALSE, 0, 0, ('잘못된 결제 상태입니다: ' || v_payment.status)::TEXT;
        RETURN;
    END IF;
    
    UPDATE payments
    SET 
        status = 'done',
        payment_key = p_payment_key,
        method = p_method,
        approved_at = p_approved_at,
        receipt_url = p_receipt_url,
        updated_at = NOW()
    WHERE order_id = p_order_id;
    
    SELECT * INTO v_result
    FROM credit_coins(
        v_payment.user_id,
        v_payment.coin_amount,
        v_payment.product_name,
        'payment',
        v_payment.id
    );
    
    RETURN QUERY SELECT TRUE, v_result.new_balance, v_payment.coin_amount, NULL::TEXT;
END;
$$;


-- ===========================================
-- 7. 결제 실패 처리 함수
-- ===========================================
CREATE OR REPLACE FUNCTION fail_payment(
    p_order_id TEXT,
    p_failure_code TEXT,
    p_failure_message TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE payments
    SET 
        status = 'failed',
        failure_code = p_failure_code,
        failure_message = p_failure_message,
        updated_at = NOW()
    WHERE order_id = p_order_id
    AND status = 'pending';
    
    RETURN FOUND;
END;
$$;


-- ===========================================
-- 8. RPC 권한 설정
-- ===========================================
REVOKE ALL ON FUNCTION credit_coins FROM PUBLIC;
REVOKE ALL ON FUNCTION debit_coins FROM PUBLIC;
REVOKE ALL ON FUNCTION refund_coins FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_bonus_coins FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_payment FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_payment FROM PUBLIC;

GRANT EXECUTE ON FUNCTION credit_coins TO service_role;
GRANT EXECUTE ON FUNCTION debit_coins TO service_role;
GRANT EXECUTE ON FUNCTION refund_coins TO service_role;
GRANT EXECUTE ON FUNCTION grant_bonus_coins TO service_role;
GRANT EXECUTE ON FUNCTION complete_payment TO service_role;
GRANT EXECUTE ON FUNCTION fail_payment TO service_role;
