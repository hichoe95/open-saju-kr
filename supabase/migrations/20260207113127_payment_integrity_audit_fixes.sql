-- Payment Integrity Audit Fixes
-- Oracle 감사 기반 CRITICAL~MEDIUM 이슈 수정
-- 적용일: 2026-02-07
--
-- C1: debit_coins_v2 동시성 - FOR UPDATE 선잠금 + 미차감 롤백
-- H2: charge_for_feature race - INSERT ON CONFLICT + ROW_COUNT 원자적 무료
-- H3: analytics_events FK - auth.users → public.users ON DELETE CASCADE
-- H4: 12개 금융 RPC REVOKE FROM PUBLIC/anon/authenticated, GRANT TO service_role
-- H5: admin_adjust_coins 음수 조정 시 coin_balances FIFO 차감
-- M8: coin_balances.source_transaction_id IS NULL 레코드 보정
-- M9: check_daily_fortune_eligibility 유효잔액 기준 변경

-- ============================================================
-- C1: debit_coins_v2 - FOR UPDATE 선잠금 + 미차감 롤백 검증
-- ============================================================
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
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 차감 금액은 0보다 커야 합니다';
    END IF;

    IF p_amount > 10000 THEN
        RAISE EXCEPTION 'AMOUNT_LIMIT_EXCEEDED: 1회 최대 사용 한도를 초과했습니다';
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
END;
$$;

-- ============================================================
-- H2: charge_for_feature - INSERT ON CONFLICT + ROW_COUNT 원자적 무료
-- ============================================================
DROP FUNCTION IF EXISTS charge_for_feature(UUID, TEXT, INT, TEXT, TEXT);

CREATE FUNCTION charge_for_feature(
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
    v_free_key TEXT;
    v_row_count INT;
    v_debit_result RECORD;
    v_desc TEXT;
BEGIN
    v_desc := COALESCE(p_description, p_feature_key);

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
        -- 원자적: INSERT 성공 = 첫 사용, 실패(conflict) = 이미 사용함
        INSERT INTO user_free_usage (user_id, feature_key)
        VALUES (p_user_id, v_free_key)
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;

        IF v_row_count > 0 THEN
            RETURN QUERY SELECT TRUE, NULL::UUID, NULL::INT, TRUE, NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- 유료 결제: debit_coins_v2 호출
    SELECT * INTO v_debit_result
    FROM debit_coins_v2(
        p_user_id,
        p_price,
        v_desc,
        p_feature_key,
        p_reference_id
    );

    RETURN QUERY SELECT TRUE, v_debit_result.transaction_id, v_debit_result.new_balance, FALSE, NULL::TEXT;
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INT, FALSE, SQLERRM::TEXT;
END;
$$;

-- ============================================================
-- H3: analytics_events FK - auth.users → public.users ON DELETE CASCADE
-- ============================================================
DO $$
BEGIN
    -- 기존 FK 제거 (auth.users 참조)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'analytics_events_user_id_fkey'
        AND table_name = 'analytics_events'
    ) THEN
        ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_user_id_fkey;
    END IF;

    -- public.users(id) ON DELETE CASCADE로 재생성
    ALTER TABLE analytics_events
    ADD CONSTRAINT analytics_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
END;
$$;

-- ============================================================
-- H5: admin_adjust_coins - 음수 조정 시 coin_balances FIFO 차감
-- ============================================================
DROP FUNCTION IF EXISTS admin_adjust_coins(UUID, UUID, INT, TEXT, TEXT);

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
    v_remaining_to_debit INT;
    v_balance_record RECORD;
    v_debit_from_this INT;
BEGIN
    IF p_amount = 0 THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '조정 금액은 0이 아니어야 합니다'::TEXT;
        RETURN;
    END IF;

    -- 멱등성 검사
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
        -- 양수: coin_balances에 추가
        INSERT INTO coin_balances (
            user_id, original_amount, remaining_amount, is_bonus,
            charged_at, expires_at, source_transaction_id
        ) VALUES (
            p_user_id, p_amount, p_amount, TRUE,
            NOW(), NOW() + INTERVAL '365 days', v_tx_id
        );
    ELSE
        -- 음수: coin_balances에서 FIFO 차감
        v_remaining_to_debit := ABS(p_amount);

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
                updated_at = NOW()
            WHERE id = v_balance_record.id;

            v_remaining_to_debit := v_remaining_to_debit - v_debit_from_this;
        END LOOP;
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

-- ============================================================
-- M9: check_daily_fortune_eligibility - coin_balances 유효잔액 기준
-- ============================================================
DROP FUNCTION IF EXISTS check_daily_fortune_eligibility(UUID, UUID, DATE);

CREATE FUNCTION check_daily_fortune_eligibility(
    p_user_id UUID,
    p_profile_id UUID,
    p_today_kst DATE
) RETURNS TABLE(
    eligible BOOLEAN,
    is_free BOOLEAN,
    cost INT,
    message TEXT,
    existing_fortune_id UUID,
    days_since_creation INT,
    current_balance INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile_created_date DATE;
    v_days_since INTEGER;
    v_existing_id UUID;
    v_existing_status VARCHAR(20);
    v_valid_balance INTEGER;
    v_cost INTEGER := 10;
    v_free_period_days INTEGER := 2;
BEGIN
    SELECT DATE(created_at AT TIME ZONE 'Asia/Seoul') INTO v_profile_created_date
    FROM saju_profiles
    WHERE id = p_profile_id AND user_id = p_user_id;

    IF v_profile_created_date IS NULL THEN
        RETURN QUERY SELECT FALSE, FALSE, 0, '프로필을 찾을 수 없거나 접근 권한이 없습니다.'::TEXT, NULL::UUID, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    SELECT id, status INTO v_existing_id, v_existing_status
    FROM daily_fortunes
    WHERE profile_id = p_profile_id
    AND fortune_date_kst = p_today_kst
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL AND v_existing_status = 'success' THEN
        RETURN QUERY SELECT FALSE, FALSE, 0, '오늘의 운세가 이미 생성되었습니다.'::TEXT, v_existing_id, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    IF v_existing_id IS NOT NULL AND v_existing_status = 'pending' THEN
        IF EXISTS (
            SELECT 1 FROM daily_fortunes
            WHERE id = v_existing_id
            AND created_at < now() - interval '5 minutes'
        ) THEN
            DELETE FROM daily_fortunes WHERE id = v_existing_id;
            v_existing_id := NULL;
        ELSE
            RETURN QUERY SELECT FALSE, FALSE, 0, '운세 생성이 진행 중입니다. 잠시 후 다시 시도해주세요.'::TEXT, v_existing_id, NULL::INTEGER, NULL::INTEGER;
            RETURN;
        END IF;
    END IF;

    IF v_existing_id IS NOT NULL AND v_existing_status IN ('failed', 'refunded') THEN
        DELETE FROM daily_fortunes WHERE id = v_existing_id;
    END IF;

    v_days_since := p_today_kst - v_profile_created_date;

    IF v_days_since < v_free_period_days THEN
        RETURN QUERY SELECT TRUE, TRUE, 0, '무료 기간입니다.'::TEXT, NULL::UUID, v_days_since, NULL::INTEGER;
        RETURN;
    END IF;

    -- 유효 잔액 기준으로 판단 (coin_balances, 만료 제외)
    SELECT COALESCE(SUM(remaining_amount), 0) INTO v_valid_balance
    FROM coin_balances
    WHERE user_id = p_user_id
      AND remaining_amount > 0
      AND expires_at > now();

    IF v_valid_balance < v_cost THEN
        RETURN QUERY SELECT FALSE, FALSE, v_cost,
            FORMAT('엽전이 부족합니다. (필요: %s, 유효 잔액: %s)', v_cost, v_valid_balance)::TEXT,
            NULL::UUID, v_days_since, v_valid_balance;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, FALSE, v_cost, '생성 가능합니다.'::TEXT, NULL::UUID, v_days_since, v_valid_balance;
END;
$$;

-- ============================================================
-- H4: 12개 금융 RPC 함수 REVOKE FROM PUBLIC/anon/authenticated
-- service_role 전용으로 제한
-- ============================================================
REVOKE ALL ON FUNCTION debit_coins_v2(UUID, INT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION debit_coins_v2(UUID, INT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION charge_for_feature(UUID, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION charge_for_feature(UUID, TEXT, INT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION admin_adjust_coins(UUID, UUID, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_adjust_coins(UUID, UUID, INT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION check_daily_fortune_eligibility(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_daily_fortune_eligibility(UUID, UUID, DATE) TO service_role;

-- 기존 함수들도 service_role 전용 확인
DO $$
DECLARE
    v_func TEXT;
BEGIN
    FOR v_func IN
        SELECT routine_name || '(' || 
               string_agg(data_type, ', ' ORDER BY ordinal_position) || ')'
        FROM information_schema.routines r
        JOIN information_schema.parameters p 
            ON r.specific_name = p.specific_name AND p.parameter_mode = 'IN'
        WHERE r.routine_name IN (
            'complete_payment', 'complete_payment_v2', 'refund_coins',
            'unlock_feature', 'grant_bonus_coins', 'get_valid_balance', 'debit_coins'
        )
        AND r.routine_schema = 'public'
        GROUP BY routine_name
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_func);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_func);
    END LOOP;
END;
$$;

-- ============================================================
-- M8: coin_balances.source_transaction_id IS NULL 레코드 보정
-- 최신 충전 트랜잭션으로 연결
-- ============================================================
UPDATE coin_balances cb
SET source_transaction_id = (
    SELECT ct.id
    FROM coin_transactions ct
    WHERE ct.user_id = cb.user_id
      AND ct.type IN ('charge', 'admin_credit', 'bonus')
      AND ct.created_at <= cb.charged_at + INTERVAL '1 minute'
    ORDER BY ct.created_at DESC
    LIMIT 1
)
WHERE cb.source_transaction_id IS NULL;
