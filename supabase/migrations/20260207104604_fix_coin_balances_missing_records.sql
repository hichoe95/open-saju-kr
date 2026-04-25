-- Fix: coin_balances 레코드 누락으로 "유효 잔액: 0" 에러 발생
-- admin_adjust_coins, credit_coins가 coin_balances를 생성하지 않아
-- debit_coins_v2의 유효 잔액 계산에서 제외됨

DROP FUNCTION IF EXISTS admin_adjust_coins(UUID, UUID, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS credit_coins(UUID, INT, TEXT, TEXT, UUID);

CREATE FUNCTION admin_adjust_coins(
    p_admin_id UUID,
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    new_balance INT,
    transaction_id UUID,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_balance INT;
    v_tx_id UUID;
    v_description TEXT;
    v_previous_balance INT;
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

    SELECT balance INTO v_previous_balance
    FROM user_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_previous_balance IS NULL THEN
        IF p_amount > 0 THEN
            INSERT INTO user_wallets (user_id, balance, total_charged, total_spent)
            VALUES (p_user_id, p_amount, 0, 0)
            RETURNING balance INTO v_new_balance;
            v_previous_balance := 0;
        ELSE
            RETURN QUERY SELECT FALSE, 0, NULL::UUID, '지갑이 없습니다'::TEXT;
            RETURN;
        END IF;
    ELSE
        IF v_previous_balance + p_amount < 0 THEN
            RETURN QUERY SELECT FALSE, v_previous_balance, NULL::UUID, format('잔액 부족 (현재: %s, 조정: %s)', v_previous_balance, p_amount)::TEXT;
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

    IF p_amount > 0 THEN
        INSERT INTO coin_balances (
            user_id, original_amount, remaining_amount, is_bonus,
            charged_at, expires_at, source_transaction_id
        ) VALUES (
            p_user_id, p_amount, p_amount, TRUE,
            NOW(), NOW() + INTERVAL '365 days', v_tx_id
        );
    END IF;

    INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, reason, before_data, after_data)
    VALUES (
        p_admin_id, 
        'balance.adjust', 
        'user', 
        p_user_id::text, 
        p_reason,
        jsonb_build_object('balance', v_previous_balance),
        jsonb_build_object('balance', v_new_balance, 'amount', p_amount, 'transaction_id', v_tx_id)
    );

    RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, '성공'::TEXT;
END;
$$;


CREATE FUNCTION credit_coins(
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
        p_user_id, 'charge', p_amount, v_new_balance, p_description, p_reference_type, p_reference_id::text
    ) RETURNING id INTO v_tx_id;

    INSERT INTO coin_balances (
        user_id, original_amount, remaining_amount, is_bonus,
        charged_at, expires_at, source_transaction_id
    ) VALUES (
        p_user_id, p_amount, p_amount, FALSE,
        NOW(), NOW() + INTERVAL '365 days', v_tx_id
    );
    
    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;


-- 기존 누락 데이터 복구
INSERT INTO coin_balances (
    user_id, original_amount, remaining_amount, is_bonus,
    charged_at, expires_at, source_transaction_id
)
SELECT 
    w.user_id,
    w.balance - COALESCE(cb_valid.valid_sum, 0),
    w.balance - COALESCE(cb_valid.valid_sum, 0),
    TRUE,
    NOW(),
    NOW() + INTERVAL '365 days',
    NULL
FROM user_wallets w
LEFT JOIN (
    SELECT user_id, SUM(remaining_amount) as valid_sum
    FROM coin_balances
    WHERE remaining_amount > 0 AND expires_at > now()
    GROUP BY user_id
) cb_valid ON w.user_id = cb_valid.user_id
WHERE w.balance > 0
  AND w.balance > COALESCE(cb_valid.valid_sum, 0);


REVOKE ALL ON FUNCTION admin_adjust_coins(UUID, UUID, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_adjust_coins(UUID, UUID, INT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION credit_coins(UUID, INT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credit_coins(UUID, INT, TEXT, TEXT, UUID) TO service_role;
