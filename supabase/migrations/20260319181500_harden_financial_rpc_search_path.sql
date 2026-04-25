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
SET search_path = ''
AS $$
DECLARE
    v_debit_result RECORD;
    v_desc TEXT;
BEGIN
    v_desc := COALESCE(p_description, p_feature_key);

    SELECT * INTO v_debit_result
    FROM public.debit_coins_v2(
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

REVOKE ALL ON FUNCTION charge_for_feature(UUID, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION charge_for_feature(UUID, TEXT, INT, TEXT, TEXT) TO service_role;

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
SET search_path = ''
AS $$
DECLARE
    v_profile_created_date DATE;
    v_days_since INTEGER;
    v_existing_id UUID;
    v_existing_status VARCHAR(20);
    v_valid_balance INTEGER;
    v_cost INTEGER := 20;
    v_cost_text TEXT;
BEGIN
    SELECT DATE(created_at AT TIME ZONE 'Asia/Seoul') INTO v_profile_created_date
    FROM public.saju_profiles
    WHERE id = p_profile_id AND user_id = p_user_id;

    IF v_profile_created_date IS NULL THEN
        RETURN QUERY SELECT FALSE, FALSE, 0, '프로필을 찾을 수 없거나 접근 권한이 없습니다.'::TEXT, NULL::UUID, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.daily_fortunes
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
            SELECT 1 FROM public.daily_fortunes
            WHERE id = v_existing_id
              AND created_at < now() - interval '5 minutes'
        ) THEN
            DELETE FROM public.daily_fortunes WHERE id = v_existing_id;
            v_existing_id := NULL;
        ELSE
            RETURN QUERY SELECT FALSE, FALSE, 0, '운세 생성이 진행 중입니다. 잠시 후 다시 시도해주세요.'::TEXT, v_existing_id, NULL::INTEGER, NULL::INTEGER;
            RETURN;
        END IF;
    END IF;

    IF v_existing_id IS NOT NULL AND v_existing_status IN ('failed', 'refunded') THEN
        DELETE FROM public.daily_fortunes WHERE id = v_existing_id;
    END IF;

    v_days_since := p_today_kst - v_profile_created_date;

    SELECT trim(both '"' from value::text)
    INTO v_cost_text
    FROM public.app_config
    WHERE key = 'daily_fortune_price'
    LIMIT 1;

    IF v_cost_text ~ '^\d+$' THEN
        v_cost := v_cost_text::INTEGER;
    END IF;

    SELECT COALESCE(SUM(remaining_amount), 0) INTO v_valid_balance
    FROM public.coin_balances
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

REVOKE ALL ON FUNCTION check_daily_fortune_eligibility(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_daily_fortune_eligibility(UUID, UUID, DATE) TO service_role;
