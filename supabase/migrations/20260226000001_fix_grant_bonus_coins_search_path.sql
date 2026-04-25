-- Drop existing function (has default parameter, must drop before recreate)
DROP FUNCTION IF EXISTS public.grant_bonus_coins(uuid, integer, text, text);

-- Fix grant_bonus_coins search_path issue (2026-02-26)
-- Problem: SET search_path = '' prevents unqualified table lookups
-- Solution: Qualify all table references with public. prefix
-- Maintains SECURITY DEFINER + SET search_path = '' for security

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
    
    RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;

-- Revoke anon EXECUTE, grant service_role only (security)
REVOKE ALL ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_bonus_coins(uuid, integer, text, text) TO service_role;
