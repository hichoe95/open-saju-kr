CREATE TABLE IF NOT EXISTS public.compatibility_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    client_request_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'charged', 'processing', 'completed', 'failed')),
    payment_state TEXT NOT NULL DEFAULT 'not_charged' CHECK (payment_state IN ('not_charged', 'charged', 'refund_pending', 'refunded')),
    payment_transaction_id UUID,
    refund_transaction_id UUID,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    request_json JSONB NOT NULL,
    result_json JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compatibility_jobs_user_request
ON public.compatibility_jobs (user_id, client_request_id);

CREATE INDEX IF NOT EXISTS idx_compatibility_jobs_status
ON public.compatibility_jobs (status, payment_state);

CREATE INDEX IF NOT EXISTS idx_compatibility_jobs_heartbeat
ON public.compatibility_jobs (last_heartbeat_at);

ALTER TABLE public.compatibility_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compatibility_jobs_select_own" ON public.compatibility_jobs;
CREATE POLICY "compatibility_jobs_select_own"
ON public.compatibility_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "compatibility_jobs_service_role_all" ON public.compatibility_jobs;
CREATE POLICY "compatibility_jobs_service_role_all"
ON public.compatibility_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_compatibility_jobs_updated_at ON public.compatibility_jobs;
CREATE TRIGGER trg_compatibility_jobs_updated_at
BEFORE UPDATE ON public.compatibility_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
