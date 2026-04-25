REVOKE ALL ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text)
TO service_role;


DROP FUNCTION IF EXISTS public.admin_adjust_coins(uuid, uuid, integer, text, text);

CREATE FUNCTION public.admin_adjust_coins(
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
    v_remaining_to_debit INT;
    v_balance_record RECORD;
    v_debit_from_this INT;
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
    ELSE
        v_remaining_to_debit := ABS(p_amount);

        FOR v_balance_record IN
            SELECT id, remaining_amount
            FROM coin_balances
            WHERE user_id = p_user_id
              AND remaining_amount > 0
              AND expires_at > NOW()
            ORDER BY is_bonus DESC, charged_at ASC, expires_at ASC
            FOR UPDATE
        LOOP
            EXIT WHEN v_remaining_to_debit <= 0;

            v_debit_from_this := LEAST(v_balance_record.remaining_amount, v_remaining_to_debit);

            UPDATE coin_balances
            SET remaining_amount = remaining_amount - v_debit_from_this,
                updated_at = NOW()
            WHERE id = v_balance_record.id;

            v_remaining_to_debit := v_remaining_to_debit - v_debit_from_this;
        END LOOP;

        IF v_remaining_to_debit > 0 THEN
            RAISE EXCEPTION 'INSUFFICIENT_BALANCE_TRACKING: coin_balances 잔액이 부족합니다';
        END IF;
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


DROP FUNCTION IF EXISTS public.admin_refund_coins(uuid, integer, text, uuid, uuid, text);

CREATE FUNCTION public.admin_refund_coins(
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT,
    p_admin_id UUID,
    p_original_tx_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    new_balance INT,
    refund_tx_id UUID,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_previous_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
    v_existing_refund UUID;
    v_effective_key TEXT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '환불 금액은 0보다 커야 합니다'::TEXT;
        RETURN;
    END IF;

    IF p_original_tx_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, 'ORIGINAL_TX_REQUIRED: 원본 거래 ID가 필요합니다'::TEXT;
        RETURN;
    END IF;

    v_effective_key := format('admin_refund:%s', p_original_tx_id::text);

    SELECT id INTO v_existing_refund
    FROM coin_transactions
    WHERE type = 'admin_refund'
      AND (
            reference_id = p_original_tx_id::text
            OR reference_id = v_effective_key
      )
    LIMIT 1;

    IF v_existing_refund IS NOT NULL THEN
        SELECT balance INTO v_new_balance
        FROM user_wallets
        WHERE user_id = p_user_id;

        RETURN QUERY SELECT TRUE, COALESCE(v_new_balance, 0), v_existing_refund, '이미 환불된 거래입니다'::TEXT;
        RETURN;
    END IF;

    SELECT balance INTO v_previous_balance
    FROM user_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_previous_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '지갑을 찾을 수 없습니다'::TEXT;
        RETURN;
    END IF;

    v_new_balance := v_previous_balance + p_amount;

    UPDATE user_wallets
    SET balance = v_new_balance,
        total_spent = GREATEST(0, total_spent - p_amount),
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id,
        'admin_refund',
        p_amount,
        v_new_balance,
        format('[관리자 환불] %s (by admin:%s)', p_reason, p_admin_id::text),
        'admin_refund',
        v_effective_key
    ) RETURNING id INTO v_tx_id;

    INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, reason, before_data, after_data, metadata)
    VALUES (
        p_admin_id,
        'payment.refund',
        'user',
        p_user_id::text,
        p_reason,
        jsonb_build_object('balance', v_previous_balance),
        jsonb_build_object('balance', v_new_balance),
        jsonb_build_object(
            'amount', p_amount,
            'original_tx_id', p_original_tx_id,
            'idempotency_key', v_effective_key,
            'refund_tx_id', v_tx_id
        )
    );

    RETURN QUERY SELECT TRUE, v_new_balance, v_tx_id, '성공'::TEXT;
END;
$$;


REVOKE ALL ON FUNCTION public.admin_adjust_coins(uuid, uuid, integer, text, text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_refund_coins(uuid, integer, text, uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_adjust_coins(uuid, uuid, integer, text, text)
TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_refund_coins(uuid, integer, text, uuid, uuid, text)
TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_admin_refund_reference_id
ON public.coin_transactions (reference_id)
WHERE type = 'admin_refund' AND reference_id IS NOT NULL;
