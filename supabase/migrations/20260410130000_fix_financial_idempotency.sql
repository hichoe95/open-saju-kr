-- =============================================================
-- Phase 1-1: /spend 이중차감 방지
-- Phase 1-2: 오늘의 운세 이중차감 방지  
-- Phase 1-3: 가입 보너스 중복 지급 방지
-- =============================================================

-- 1) coin_transactions에 spend 타입 멱등성 unique index 추가
--    동일 (user_id, reference_type, reference_id) + spend 타입은 1건만 허용
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_spend_idempotent
ON public.coin_transactions (user_id, reference_type, reference_id)
WHERE type = 'spend' AND reference_id IS NOT NULL;

-- 2) daily_fortunes에 (profile_id, fortune_date_kst) unique constraint 추가
--    동일 프로필 + 동일 날짜에 운세 1건만 허용
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_daily_fortunes_profile_date'
    ) THEN
        ALTER TABLE public.daily_fortunes
        ADD CONSTRAINT uq_daily_fortunes_profile_date
        UNIQUE (profile_id, fortune_date_kst);
    END IF;
END;
$$;

-- 3) coin_transactions에 bonus 타입 멱등성 unique index 추가
--    동일 (user_id, reference_type) + bonus 타입은 1건만 허용
--    signup_bonus, review_bonus 중복 지급 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_bonus_idempotent
ON public.coin_transactions (user_id, reference_type)
WHERE type = 'bonus' AND reference_type IN ('signup_bonus', 'review_bonus');

-- 4) debit_coins_v2에 멱등성 체크 추가
--    동일 reference_id + reference_type + spend가 이미 있으면 기존 결과 반환
DROP FUNCTION IF EXISTS debit_coins_v2(UUID, INT, TEXT, TEXT, TEXT);

CREATE FUNCTION debit_coins_v2(
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
    v_valid_balance INT;
    v_new_balance INT;
    v_tx_id UUID;
    v_remaining_to_debit INT;
    v_balance_record RECORD;
    v_debit_from_this INT;
    v_existing_tx_id UUID;
    v_existing_balance INT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 차감 금액은 0보다 커야 합니다';
    END IF;

    IF p_amount > 10000 THEN
        RAISE EXCEPTION 'AMOUNT_LIMIT_EXCEEDED: 1회 최대 사용 한도를 초과했습니다';
    END IF;

    -- 멱등성 체크: 동일 reference가 이미 있으면 기존 결과 반환
    IF p_reference_id IS NOT NULL AND p_reference_type IS NOT NULL THEN
        SELECT ct.id, uw.balance
        INTO v_existing_tx_id, v_existing_balance
        FROM coin_transactions ct
        JOIN user_wallets uw ON uw.user_id = ct.user_id
        WHERE ct.user_id = p_user_id
          AND ct.reference_type = p_reference_type
          AND ct.reference_id = p_reference_id
          AND ct.type = 'spend'
        LIMIT 1;

        IF v_existing_tx_id IS NOT NULL THEN
            RETURN QUERY SELECT v_existing_balance, v_existing_tx_id;
            RETURN;
        END IF;
    END IF;

    -- FOR UPDATE로 대상 row를 먼저 잠그고 합계 계산 (동시성 안전)
    SELECT COALESCE(SUM(remaining_amount), 0) INTO v_valid_balance
    FROM coin_balances
    WHERE user_id = p_user_id
      AND remaining_amount > 0
      AND expires_at > now()
    FOR UPDATE;

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

    -- 안전 검증: 루프 후에도 미차감 잔여가 있으면 롤백
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
EXCEPTION
    WHEN unique_violation THEN
        -- ub3d9uc2dcuc131 race: unique indexuc5d0 uac78ub9b0 uacbduc6b0 uae30uc874 ud2b8ub79cuc7educ158 ubc18ud658
        IF p_reference_id IS NOT NULL AND p_reference_type IS NOT NULL THEN
            SELECT ct.id, uw.balance
            INTO v_existing_tx_id, v_existing_balance
            FROM coin_transactions ct
            JOIN user_wallets uw ON uw.user_id = ct.user_id
            WHERE ct.user_id = p_user_id
              AND ct.reference_type = p_reference_type
              AND ct.reference_id = p_reference_id
              AND ct.type = 'spend'
            LIMIT 1;

            IF v_existing_tx_id IS NOT NULL THEN
                RETURN QUERY SELECT v_existing_balance, v_existing_tx_id;
                RETURN;
            END IF;
        END IF;
        RAISE;
END;
$$;
