-- ============================================
-- Refund Amount Validation Migration
-- Prevents over-refunding by validating against original transaction
-- ============================================

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
    v_original_amount INT;
    v_original_type TEXT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 환불 금액은 0보다 커야 합니다';
    END IF;
    
    SELECT ABS(amount), type INTO v_original_amount, v_original_type
    FROM coin_transactions
    WHERE id = p_original_tx_id AND user_id = p_user_id;
    
    IF v_original_amount IS NULL THEN
        RAISE EXCEPTION 'ORIGINAL_TX_NOT_FOUND: 원본 거래를 찾을 수 없습니다';
    END IF;
    
    IF v_original_type != 'spend' THEN
        RAISE EXCEPTION 'INVALID_TX_TYPE: spend 유형의 거래만 환불 가능합니다 (현재: %)', v_original_type;
    END IF;
    
    IF p_amount > v_original_amount THEN
        RAISE EXCEPTION 'REFUND_EXCEEDS_ORIGINAL: 환불 금액(%)이 원본 거래 금액(%)을 초과할 수 없습니다', p_amount, v_original_amount;
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
