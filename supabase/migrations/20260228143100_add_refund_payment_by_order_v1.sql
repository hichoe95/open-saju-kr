CREATE OR REPLACE FUNCTION public.refund_payment_by_order_v1(
    p_order_id text,
    p_reason text DEFAULT '결제 취소에 따른 코인 회수',
    p_event_type text DEFAULT NULL
) RETURNS TABLE(
    success boolean,
    clawed_back_amount integer,
    remaining_unclawed_amount integer,
    transaction_id uuid,
    message text,
    manual_review_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_payment record;
    v_wallet record;
    v_total_awarded integer := 0;
    v_reclaimable integer := 0;
    v_remaining_to_clawback integer := 0;
    v_balance_record record;
    v_debit_from_this integer := 0;
    v_unclawed integer := 0;
    v_tx_id uuid;
BEGIN
    SELECT * INTO v_payment
    FROM public.payments
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_payment IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, 0, NULL::uuid, 'ORDER_NOT_FOUND: 주문을 찾을 수 없습니다'::text, FALSE;
        RETURN;
    END IF;

    IF v_payment.status = 'canceled' THEN
        RETURN QUERY SELECT TRUE, 0, 0, NULL::uuid, '이미 취소 처리된 주문입니다'::text, FALSE;
        RETURN;
    END IF;

    IF v_payment.status <> 'done' THEN
        UPDATE public.payments
        SET status = 'canceled',
            updated_at = now()
        WHERE id = v_payment.id;

        RETURN QUERY SELECT TRUE, 0, 0, NULL::uuid, '결제 완료 전 취소로 상태만 canceled 처리했습니다'::text, FALSE;
        RETURN;
    END IF;

    v_total_awarded := COALESCE(v_payment.coin_amount, 0);

    SELECT * INTO v_wallet
    FROM public.user_wallets
    WHERE user_id = v_payment.user_id
    FOR UPDATE;

    IF v_wallet IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, v_total_awarded, NULL::uuid, 'WALLET_NOT_FOUND: 지갑을 찾을 수 없습니다'::text, TRUE;
        RETURN;
    END IF;

    SELECT COALESCE(SUM(cb.remaining_amount), 0)
    INTO v_reclaimable
    FROM public.coin_balances cb
    JOIN public.coin_transactions ct
      ON ct.id = cb.source_transaction_id
    WHERE ct.user_id = v_payment.user_id
      AND ct.reference_type IN ('payment', 'bonus')
      AND ct.reference_id = v_payment.id::text
      AND cb.remaining_amount > 0;

    v_reclaimable := LEAST(v_reclaimable, COALESCE(v_wallet.balance, 0));

    IF v_reclaimable > 0 THEN
        v_remaining_to_clawback := v_reclaimable;

        FOR v_balance_record IN
            SELECT cb.id, cb.remaining_amount
            FROM public.coin_balances cb
            JOIN public.coin_transactions ct
              ON ct.id = cb.source_transaction_id
            WHERE ct.user_id = v_payment.user_id
              AND ct.reference_type IN ('payment', 'bonus')
              AND ct.reference_id = v_payment.id::text
              AND cb.remaining_amount > 0
            ORDER BY cb.is_bonus DESC, cb.charged_at ASC, cb.expires_at ASC
            FOR UPDATE
        LOOP
            EXIT WHEN v_remaining_to_clawback <= 0;

            v_debit_from_this := LEAST(v_balance_record.remaining_amount, v_remaining_to_clawback);

            UPDATE public.coin_balances
            SET remaining_amount = remaining_amount - v_debit_from_this,
                updated_at = now()
            WHERE id = v_balance_record.id;

            v_remaining_to_clawback := v_remaining_to_clawback - v_debit_from_this;
        END LOOP;

        IF v_remaining_to_clawback > 0 THEN
            RAISE EXCEPTION 'CLAWBACK_INCOMPLETE: 회수 미완료 (미회수: %)', v_remaining_to_clawback;
        END IF;

        UPDATE public.user_wallets
        SET balance = GREATEST(balance - v_reclaimable, 0),
            total_charged = GREATEST(total_charged - v_reclaimable, 0),
            updated_at = now()
        WHERE user_id = v_payment.user_id;

        INSERT INTO public.coin_transactions (
            user_id,
            type,
            amount,
            balance_after,
            description,
            reference_type,
            reference_id
        )
        VALUES (
            v_payment.user_id,
            'payment_clawback',
            -v_reclaimable,
            GREATEST(COALESCE(v_wallet.balance, 0) - v_reclaimable, 0),
            COALESCE(p_reason, '결제 취소에 따른 코인 회수'),
            COALESCE(p_event_type, 'payment_cancel'),
            v_payment.id::text
        )
        RETURNING id INTO v_tx_id;
    END IF;

    v_unclawed := GREATEST(v_total_awarded - v_reclaimable, 0);

    UPDATE public.payments
    SET status = 'canceled',
        updated_at = now()
    WHERE id = v_payment.id;

    RETURN QUERY SELECT
        TRUE,
        v_reclaimable,
        v_unclawed,
        v_tx_id,
        CASE
            WHEN v_unclawed > 0 THEN '부분 회수 완료, 수동 검토 필요'
            ELSE '회수 완료'
        END::text,
        (v_unclawed > 0);
END;
$$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.refund_payment_by_order_v1(text, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.refund_payment_by_order_v1(text, text, text) FROM authenticated;
  REVOKE ALL ON FUNCTION public.refund_payment_by_order_v1(text, text, text) FROM anon;
  GRANT EXECUTE ON FUNCTION public.refund_payment_by_order_v1(text, text, text) TO service_role;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;
