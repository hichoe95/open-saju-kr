-- Fix debit_coins_v2: remove invalid FOR UPDATE with aggregate query

CREATE OR REPLACE FUNCTION public.debit_coins_v2(
    p_user_id UUID,
    p_amount INT,
    p_description TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance INT, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_valid_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
    v_remaining_to_debit INT;
    v_balance_record RECORD;
    v_debit_from_this INT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 차감 금액은 0보다 커야 합니다';
    END IF;

    IF p_amount > 10000 THEN
        RAISE EXCEPTION 'AMOUNT_LIMIT_EXCEEDED: 1회 최대 사용 한도를 초과했습니다';
    END IF;

    SELECT COALESCE(SUM(remaining_amount), 0) INTO v_valid_balance
    FROM coin_balances
    WHERE user_id = p_user_id
      AND remaining_amount > 0
      AND expires_at > now();

    IF v_valid_balance < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: 엽전이 부족합니다. (필요: %, 유효 잔액: %)', p_amount, v_valid_balance;
    END IF;

    v_remaining_to_debit := p_amount;

    FOR v_balance_record IN
        SELECT id, remaining_amount
        FROM coin_balances
        WHERE user_id = p_user_id
          AND remaining_amount > 0
          AND expires_at > now()
        ORDER BY is_bonus DESC, charged_at ASC, expires_at ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_remaining_to_debit <= 0;

        v_debit_from_this := LEAST(v_balance_record.remaining_amount, v_remaining_to_debit);

        UPDATE coin_balances
        SET remaining_amount = remaining_amount - v_debit_from_this,
            updated_at = now()
        WHERE id = v_balance_record.id;

        v_remaining_to_debit := v_remaining_to_debit - v_debit_from_this;
    END LOOP;

    IF v_remaining_to_debit > 0 THEN
        RAISE EXCEPTION 'DEBIT_INCOMPLETE: 차감이 완료되지 않았습니다 (미차감: %)', v_remaining_to_debit;
    END IF;

    UPDATE user_wallets
    SET
        balance = balance - p_amount,
        total_spent = total_spent + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: 지갑을 찾을 수 없습니다.';
    END IF;

    INSERT INTO coin_transactions (
        user_id, type, amount, balance_after, description, reference_type, reference_id
    ) VALUES (
        p_user_id, 'spend', -p_amount, v_new_balance, p_description, p_reference_type, p_reference_id
    ) RETURNING id INTO v_tx_id;

    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;
