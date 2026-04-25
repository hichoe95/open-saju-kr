ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS payment_mode_snapshot text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_mode_snapshot_check'
  ) THEN
    ALTER TABLE public.payments
    ADD CONSTRAINT payments_payment_mode_snapshot_check
    CHECK (
      payment_mode_snapshot IS NULL
      OR payment_mode_snapshot IN ('test', 'live')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_status_mode_snapshot
ON public.payments (status, payment_mode_snapshot);

COMMENT ON COLUMN public.payments.payment_mode_snapshot
IS 'Order-level payment mode snapshot (test/live) captured at prepare time';
