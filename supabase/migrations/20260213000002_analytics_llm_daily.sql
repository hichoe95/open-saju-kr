CREATE TABLE IF NOT EXISTS public.analytics_llm_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  call_count integer NOT NULL DEFAULT 0,
  avg_duration_ms numeric(10,2) DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  avg_tokens integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(date, provider, model)
);

CREATE INDEX IF NOT EXISTS idx_llm_daily_date
  ON public.analytics_llm_daily(date);

ALTER TABLE public.analytics_llm_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_llm_daily_select_admin ON public.analytics_llm_daily;
CREATE POLICY analytics_llm_daily_select_admin ON public.analytics_llm_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = (SELECT auth.uid())
        AND is_admin = true
    )
  );

CREATE OR REPLACE FUNCTION public.aggregate_llm_daily(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.analytics_llm_daily
  WHERE date = p_date;

  INSERT INTO public.analytics_llm_daily (
    date,
    provider,
    model,
    call_count,
    avg_duration_ms,
    success_count,
    failure_count,
    avg_tokens
  )
  SELECT
    p_date,
    COALESCE(NULLIF(event_data->>'provider', ''), 'unknown') AS provider,
    COALESCE(NULLIF(event_data->>'model', ''), 'unknown') AS model,
    COUNT(*) FILTER (WHERE event_type = 'analysis_started')::integer AS call_count,
    COALESCE(AVG((event_data->>'processing_time_ms')::numeric), 0)::numeric(10,2) AS avg_duration_ms,
    COUNT(*) FILTER (WHERE event_type = 'analysis_completed')::integer AS success_count,
    COUNT(*) FILTER (WHERE event_type = 'analysis_failed')::integer AS failure_count,
    COALESCE(AVG((event_data->>'total_tokens')::numeric), 0)::integer AS avg_tokens
  FROM public.analytics_events
  WHERE event_type IN ('analysis_started', 'analysis_completed', 'analysis_failed')
    AND created_at::date = p_date
  GROUP BY
    COALESCE(NULLIF(event_data->>'provider', ''), 'unknown'),
    COALESCE(NULLIF(event_data->>'model', ''), 'unknown')
  ON CONFLICT (date, provider, model) DO UPDATE
  SET
    call_count = EXCLUDED.call_count,
    avg_duration_ms = EXCLUDED.avg_duration_ms,
    success_count = EXCLUDED.success_count,
    failure_count = EXCLUDED.failure_count,
    avg_tokens = EXCLUDED.avg_tokens;
END;
$$;

REVOKE ALL ON FUNCTION public.aggregate_llm_daily(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_llm_daily(date) TO service_role;
