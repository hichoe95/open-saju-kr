CREATE TABLE IF NOT EXISTS public.analytics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  dau integer NOT NULL DEFAULT 0,
  page_views integer NOT NULL DEFAULT 0,
  api_calls integer NOT NULL DEFAULT 0,
  avg_response_time_ms numeric(10,2) DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  total_revenue integer NOT NULL DEFAULT 0,
  total_readings integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_page_views_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  page_name text NOT NULL,
  view_count integer NOT NULL DEFAULT 0,
  unique_visitors integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(date, page_name)
);

CREATE TABLE IF NOT EXISTS public.analytics_api_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  endpoint text NOT NULL,
  call_count integer NOT NULL DEFAULT 0,
  avg_duration_ms numeric(10,2) DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(date, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_date
  ON public.analytics_daily(date);

CREATE INDEX IF NOT EXISTS idx_page_views_daily_date_page
  ON public.analytics_page_views_daily(date, page_name);

CREATE INDEX IF NOT EXISTS idx_api_metrics_daily_date
  ON public.analytics_api_metrics_daily(date, endpoint);

ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_page_views_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_api_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_daily_select_admin ON public.analytics_daily;
CREATE POLICY analytics_daily_select_admin ON public.analytics_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = (SELECT auth.uid())
        AND is_admin = true
    )
  );

DROP POLICY IF EXISTS analytics_page_views_daily_select_admin ON public.analytics_page_views_daily;
CREATE POLICY analytics_page_views_daily_select_admin ON public.analytics_page_views_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = (SELECT auth.uid())
        AND is_admin = true
    )
  );

DROP POLICY IF EXISTS analytics_api_metrics_daily_select_admin ON public.analytics_api_metrics_daily;
CREATE POLICY analytics_api_metrics_daily_select_admin ON public.analytics_api_metrics_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = (SELECT auth.uid())
        AND is_admin = true
    )
  );

CREATE OR REPLACE FUNCTION public.aggregate_daily_analytics(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dau integer := 0;
  v_page_views integer := 0;
  v_api_calls integer := 0;
  v_new_users integer := 0;
  v_total_revenue integer := 0;
  v_total_readings integer := 0;
  v_avg_response_time_ms numeric(10,2) := 0;
  v_error_count integer := 0;
BEGIN
  SELECT COUNT(DISTINCT user_id)::integer
  INTO v_dau
  FROM public.analytics_events
  WHERE event_type = 'page_view'
    AND created_at::date = p_date;

  SELECT COUNT(*)::integer
  INTO v_page_views
  FROM public.analytics_events
  WHERE event_type = 'page_view'
    AND created_at::date = p_date;

  SELECT COUNT(*)::integer
  INTO v_new_users
  FROM public.users
  WHERE created_at::date = p_date;

  SELECT COALESCE(SUM(amount), 0)::integer
  INTO v_total_revenue
  FROM public.payments
  WHERE status = 'done'
    AND created_at::date = p_date;

  SELECT COUNT(*)::integer
  INTO v_total_readings
  FROM public.user_readings
  WHERE created_at::date = p_date;

  SELECT COALESCE(AVG((event_data->>'processing_time_ms')::numeric), 0)::numeric(10,2)
  INTO v_avg_response_time_ms
  FROM public.analytics_events
  WHERE event_data->>'processing_time_ms' IS NOT NULL
    AND created_at::date = p_date;

  SELECT COUNT(*)::integer
  INTO v_error_count
  FROM public.analytics_events
  WHERE event_type = 'analysis_failed'
    AND created_at::date = p_date;

  SELECT COUNT(*)::integer
  INTO v_api_calls
  FROM public.analytics_events
  WHERE created_at::date = p_date
    AND event_data->>'endpoint' IS NOT NULL;

  INSERT INTO public.analytics_daily (
    date,
    dau,
    page_views,
    api_calls,
    avg_response_time_ms,
    error_count,
    new_users,
    total_revenue,
    total_readings,
    updated_at
  )
  VALUES (
    p_date,
    v_dau,
    v_page_views,
    v_api_calls,
    v_avg_response_time_ms,
    v_error_count,
    v_new_users,
    v_total_revenue,
    v_total_readings,
    now()
  )
  ON CONFLICT (date) DO UPDATE
  SET
    dau = EXCLUDED.dau,
    page_views = EXCLUDED.page_views,
    api_calls = EXCLUDED.api_calls,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    error_count = EXCLUDED.error_count,
    new_users = EXCLUDED.new_users,
    total_revenue = EXCLUDED.total_revenue,
    total_readings = EXCLUDED.total_readings,
    updated_at = now();

  DELETE FROM public.analytics_page_views_daily
  WHERE date = p_date;

  INSERT INTO public.analytics_page_views_daily (
    date,
    page_name,
    view_count,
    unique_visitors
  )
  SELECT
    p_date,
    COALESCE(NULLIF(event_data->>'page', ''), 'unknown') AS page_name,
    COUNT(*)::integer AS view_count,
    COUNT(DISTINCT user_id)::integer AS unique_visitors
  FROM public.analytics_events
  WHERE event_type = 'page_view'
    AND created_at::date = p_date
  GROUP BY COALESCE(NULLIF(event_data->>'page', ''), 'unknown')
  ON CONFLICT (date, page_name) DO UPDATE
  SET
    view_count = EXCLUDED.view_count,
    unique_visitors = EXCLUDED.unique_visitors;

  DELETE FROM public.analytics_api_metrics_daily
  WHERE date = p_date;

  INSERT INTO public.analytics_api_metrics_daily (
    date,
    endpoint,
    call_count,
    avg_duration_ms,
    error_count
  )
  SELECT
    p_date,
    COALESCE(NULLIF(event_data->>'endpoint', ''), 'unknown') AS endpoint,
    COUNT(*)::integer AS call_count,
    COALESCE(AVG((event_data->>'processing_time_ms')::numeric), 0)::numeric(10,2) AS avg_duration_ms,
    COUNT(*) FILTER (WHERE event_type = 'analysis_failed')::integer AS error_count
  FROM public.analytics_events
  WHERE created_at::date = p_date
    AND event_data->>'endpoint' IS NOT NULL
  GROUP BY COALESCE(NULLIF(event_data->>'endpoint', ''), 'unknown')
  ON CONFLICT (date, endpoint) DO UPDATE
  SET
    call_count = EXCLUDED.call_count,
    avg_duration_ms = EXCLUDED.avg_duration_ms,
    error_count = EXCLUDED.error_count;
END;
$$;

REVOKE ALL ON FUNCTION public.aggregate_daily_analytics(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_analytics(date) TO service_role;
