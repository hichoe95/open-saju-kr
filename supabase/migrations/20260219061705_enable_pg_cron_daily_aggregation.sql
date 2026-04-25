CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE OR REPLACE FUNCTION public.aggregate_analytics_yesterday_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_date date := (CURRENT_DATE - INTERVAL '1 day')::date;
  v_range_start timestamptz := (CURRENT_DATE - INTERVAL '1 day');
  v_range_end timestamptz := CURRENT_DATE;
BEGIN
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
  SELECT
    v_target_date,
    (
      SELECT COUNT(DISTINCT user_id)::integer
      FROM public.analytics_events
      WHERE event_type = 'page_view'
        AND created_at >= v_range_start
        AND created_at < v_range_end
    ) AS dau,
    (
      SELECT COUNT(*)::integer
      FROM public.analytics_events
      WHERE event_type = 'page_view'
        AND created_at >= v_range_start
        AND created_at < v_range_end
    ) AS page_views,
    (
      SELECT COUNT(*)::integer
      FROM public.analytics_events
      WHERE created_at >= v_range_start
        AND created_at < v_range_end
        AND event_data->>'endpoint' IS NOT NULL
    ) AS api_calls,
    (
      SELECT COALESCE(AVG((event_data->>'processing_time_ms')::numeric), 0)::numeric(10,2)
      FROM public.analytics_events
      WHERE event_data->>'processing_time_ms' IS NOT NULL
        AND created_at >= v_range_start
        AND created_at < v_range_end
    ) AS avg_response_time_ms,
    (
      SELECT COUNT(*)::integer
      FROM public.analytics_events
      WHERE event_type = 'analysis_failed'
        AND created_at >= v_range_start
        AND created_at < v_range_end
    ) AS error_count,
    (
      SELECT COUNT(*)::integer
      FROM public.users
      WHERE created_at >= v_range_start
        AND created_at < v_range_end
    ) AS new_users,
    (
      SELECT COALESCE(SUM(amount), 0)::integer
      FROM public.payments
      WHERE status = 'done'
        AND created_at >= v_range_start
        AND created_at < v_range_end
    ) AS total_revenue,
    (
      SELECT COUNT(*)::integer
      FROM public.user_readings
      WHERE created_at >= v_range_start
        AND created_at < v_range_end
    ) AS total_readings,
    now() AS updated_at
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
  WHERE date = v_target_date;

  INSERT INTO public.analytics_page_views_daily (
    date,
    page_name,
    view_count,
    unique_visitors
  )
  SELECT
    v_target_date,
    COALESCE(NULLIF(event_data->>'page', ''), 'unknown') AS page_name,
    COUNT(*)::integer AS view_count,
    COUNT(DISTINCT user_id)::integer AS unique_visitors
  FROM public.analytics_events
  WHERE event_type = 'page_view'
    AND created_at >= v_range_start
    AND created_at < v_range_end
  GROUP BY COALESCE(NULLIF(event_data->>'page', ''), 'unknown')
  ON CONFLICT (date, page_name) DO UPDATE
  SET
    view_count = EXCLUDED.view_count,
    unique_visitors = EXCLUDED.unique_visitors;

  DELETE FROM public.analytics_api_metrics_daily
  WHERE date = v_target_date;

  INSERT INTO public.analytics_api_metrics_daily (
    date,
    endpoint,
    call_count,
    avg_duration_ms,
    error_count
  )
  SELECT
    v_target_date,
    COALESCE(NULLIF(event_data->>'endpoint', ''), 'unknown') AS endpoint,
    COUNT(*)::integer AS call_count,
    COALESCE(AVG((event_data->>'processing_time_ms')::numeric), 0)::numeric(10,2) AS avg_duration_ms,
    COUNT(*) FILTER (WHERE event_type = 'analysis_failed')::integer AS error_count
  FROM public.analytics_events
  WHERE created_at >= v_range_start
    AND created_at < v_range_end
    AND event_data->>'endpoint' IS NOT NULL
  GROUP BY COALESCE(NULLIF(event_data->>'endpoint', ''), 'unknown')
  ON CONFLICT (date, endpoint) DO UPDATE
  SET
    call_count = EXCLUDED.call_count,
    avg_duration_ms = EXCLUDED.avg_duration_ms,
    error_count = EXCLUDED.error_count;

  DELETE FROM public.analytics_llm_daily
  WHERE date = v_target_date;

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
    v_target_date,
    COALESCE(NULLIF(event_data->>'provider', ''), 'unknown') AS provider,
    COALESCE(NULLIF(event_data->>'model', ''), 'unknown') AS model,
    COUNT(*) FILTER (WHERE event_type = 'analysis_started')::integer AS call_count,
    COALESCE(AVG((event_data->>'processing_time_ms')::numeric), 0)::numeric(10,2) AS avg_duration_ms,
    COUNT(*) FILTER (WHERE event_type = 'analysis_completed')::integer AS success_count,
    COUNT(*) FILTER (WHERE event_type = 'analysis_failed')::integer AS failure_count,
    COALESCE(AVG((event_data->>'total_tokens')::numeric), 0)::integer AS avg_tokens
  FROM public.analytics_events
  WHERE event_type IN ('analysis_started', 'analysis_completed', 'analysis_failed')
    AND created_at >= v_range_start
    AND created_at < v_range_end
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

REVOKE ALL ON FUNCTION public.aggregate_analytics_yesterday_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_analytics_yesterday_cron() TO service_role;

DO $$
DECLARE
  v_existing_job_id integer;
BEGIN
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'analytics_daily_aggregation_kst_midnight'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'analytics_daily_aggregation_kst_midnight',
    '0 15 * * *',
    $job$
      SELECT public.aggregate_analytics_yesterday_cron();
    $job$
  );
END;
$$;
