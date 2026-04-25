DROP FUNCTION IF EXISTS public.grant_bonus_coins(uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.grant_bonus_coins(
    p_user_id UUID,
    p_amount INT,
    p_description TEXT,
    p_reference_type TEXT DEFAULT 'bonus'
) RETURNS TABLE(new_balance INT, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

    INSERT INTO public.user_wallets (user_id, balance, total_charged, total_spent)
    VALUES (p_user_id, p_amount, 0, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET
        balance = public.user_wallets.balance + p_amount,
        updated_at = NOW()
    RETURNING balance INTO v_new_balance;

    INSERT INTO public.coin_transactions (
        user_id, type, amount, balance_after, description, reference_type
    ) VALUES (
        p_user_id, 'bonus', p_amount, v_new_balance, p_description, p_reference_type
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.coin_balances (
        user_id,
        original_amount,
        remaining_amount,
        is_bonus,
        charged_at,
        expires_at,
        source_transaction_id
    ) VALUES (
        p_user_id,
        p_amount,
        p_amount,
        TRUE,
        NOW(),
        NOW() + INTERVAL '365 days',
        v_tx_id
    );

    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;

WITH valid_sum AS (
    SELECT
        user_id,
        COALESCE(SUM(remaining_amount), 0) AS valid_balance
    FROM public.coin_balances
    WHERE remaining_amount > 0
      AND expires_at > NOW()
    GROUP BY user_id
),
signup_bonus_missing AS (
    SELECT
        ct.id AS tx_id,
        ct.user_id,
        ct.amount,
        ct.created_at,
        GREATEST(0, COALESCE(uw.balance, 0) - COALESCE(vs.valid_balance, 0)) AS wallet_delta
    FROM public.coin_transactions ct
    JOIN public.user_wallets uw ON uw.user_id = ct.user_id
    LEFT JOIN valid_sum vs ON vs.user_id = ct.user_id
    LEFT JOIN public.coin_balances cb ON cb.source_transaction_id = ct.id
    WHERE ct.type = 'bonus'
      AND ct.reference_type = 'signup_bonus'
      AND ct.amount > 0
      AND cb.id IS NULL
      AND ct.created_at + INTERVAL '365 days' > NOW()
)
INSERT INTO public.coin_balances (
    user_id,
    original_amount,
    remaining_amount,
    is_bonus,
    charged_at,
    expires_at,
    source_transaction_id
)
SELECT
    sb.user_id,
    sb.amount,
    LEAST(sb.amount, sb.wallet_delta) AS remaining_amount,
    TRUE,
    sb.created_at,
    sb.created_at + INTERVAL '365 days',
    sb.tx_id
FROM signup_bonus_missing sb
WHERE LEAST(sb.amount, sb.wallet_delta) > 0;

REVOKE ALL ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) TO service_role;
