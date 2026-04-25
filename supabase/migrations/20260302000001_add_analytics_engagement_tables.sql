-- ============================================
-- Analytics Engagement Tables 마이그레이션
-- tab_engagement_events + session_funnel_events
-- ============================================

-- 1. tab_engagement_events 테이블 생성
CREATE TABLE IF NOT EXISTS public.tab_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reading_id TEXT,
  tab_name TEXT NOT NULL,
  dwell_ms INTEGER NOT NULL,
  is_bounce BOOLEAN GENERATED ALWAYS AS (dwell_ms < 3000) STORED,
  source_tab TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. session_funnel_events 테이블 생성
CREATE TABLE IF NOT EXISTS public.session_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  step TEXT NOT NULL CHECK (step IN ('input_started','result_received','tab_clicked','profile_saved','shared')),
  step_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_tab_engagement_user_created
  ON public.tab_engagement_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tab_engagement_tab_created
  ON public.tab_engagement_events(tab_name, created_at);

CREATE INDEX IF NOT EXISTS idx_session_funnel_user_created
  ON public.session_funnel_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_session_funnel_session_id
  ON public.session_funnel_events(session_id);

-- 4. RLS 활성화
ALTER TABLE public.tab_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_funnel_events ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책: tab_engagement_events
DROP POLICY IF EXISTS "tab_engagement_insert_authenticated" ON public.tab_engagement_events;
CREATE POLICY "tab_engagement_insert_authenticated" ON public.tab_engagement_events
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "tab_engagement_select_service_role" ON public.tab_engagement_events;
CREATE POLICY "tab_engagement_select_service_role" ON public.tab_engagement_events
  FOR SELECT TO service_role
  USING (true);

-- 6. RLS 정책: session_funnel_events
DROP POLICY IF EXISTS "session_funnel_insert_authenticated" ON public.session_funnel_events;
CREATE POLICY "session_funnel_insert_authenticated" ON public.session_funnel_events
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "session_funnel_select_service_role" ON public.session_funnel_events;
CREATE POLICY "session_funnel_select_service_role" ON public.session_funnel_events
  FOR SELECT TO service_role
  USING (true);

-- 7. pg_cron: 90일 후 자동 삭제
DO $$
DECLARE
  v_existing_job_id integer;
BEGIN
  -- tab_engagement_events 정리 job
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'tab_engagement_events_cleanup_90d'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'tab_engagement_events_cleanup_90d',
    '30 15 * * *',
    $job$
      DELETE FROM public.tab_engagement_events
      WHERE created_at < now() - INTERVAL '90 days';
    $job$
  );

  -- session_funnel_events 정리 job
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'session_funnel_events_cleanup_90d'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'session_funnel_events_cleanup_90d',
    '35 15 * * *',
    $job$
      DELETE FROM public.session_funnel_events
      WHERE created_at < now() - INTERVAL '90 days';
    $job$
  );
END;
$$;
