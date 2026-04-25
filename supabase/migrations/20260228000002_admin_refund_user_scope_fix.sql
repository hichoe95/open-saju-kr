CREATE OR REPLACE FUNCTION public.admin_refund_coins(
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
    v_original_tx_user UUID;
BEGIN
    IF p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '환불 금액은 0보다 커야 합니다'::TEXT;
        RETURN;
    END IF;

    IF p_original_tx_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, 'ORIGINAL_TX_REQUIRED: 원본 거래 ID가 필요합니다'::TEXT;
        RETURN;
    END IF;

    SELECT user_id INTO v_original_tx_user
    FROM coin_transactions
    WHERE id = p_original_tx_id
    LIMIT 1;

    IF v_original_tx_user IS NULL OR v_original_tx_user <> p_user_id THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, 'ORIGINAL_TX_MISMATCH: 원본 거래 사용자 검증에 실패했습니다'::TEXT;
        RETURN;
    END IF;

    v_effective_key := format('admin_refund:%s', p_original_tx_id::text);

    SELECT id INTO v_existing_refund
    FROM coin_transactions
    WHERE user_id = p_user_id
      AND type = 'admin_refund'
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

DROP INDEX IF EXISTS idx_coin_transactions_admin_refund_reference_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_admin_refund_user_reference_id
ON public.coin_transactions (user_id, reference_id)
WHERE type = 'admin_refund' AND reference_id IS NOT NULL;
