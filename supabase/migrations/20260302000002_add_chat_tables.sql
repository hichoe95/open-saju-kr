-- ============================================
-- Chat Tables 마이그레이션
-- chat_sessions + chat_messages
-- Amendment: expires_at 없음, status: active/completed만
-- ============================================

-- 1. updated_at 자동 업데이트 함수 (없으면 생성)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. chat_sessions 테이블 생성
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  birth_key TEXT NOT NULL,
  domain TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT 'classic',
  saju_context JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  max_turns INTEGER NOT NULL DEFAULT 10,
  current_turn INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. chat_messages 테이블 생성
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  turn INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  response_format TEXT DEFAULT 'freeform' CHECK (response_format IN ('decision', 'freeform', 'system')),
  tokens_used INTEGER DEFAULT 0,
  cost_coins INTEGER DEFAULT 0,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_status
  ON public.chat_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_turn
  ON public.chat_messages(session_id, turn);

-- 5. updated_at 트리거 (chat_sessions만)
DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6. RLS 활성화
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 7. RLS 정책: chat_sessions
DROP POLICY IF EXISTS "chat_sessions_select_own" ON public.chat_sessions;
CREATE POLICY "chat_sessions_select_own" ON public.chat_sessions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "chat_sessions_insert_own" ON public.chat_sessions;
CREATE POLICY "chat_sessions_insert_own" ON public.chat_sessions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "chat_sessions_update_service_role" ON public.chat_sessions;
CREATE POLICY "chat_sessions_update_service_role" ON public.chat_sessions
  FOR UPDATE TO service_role
  USING (true);

-- 8. RLS 정책: chat_messages
DROP POLICY IF EXISTS "chat_messages_select_own" ON public.chat_messages;
CREATE POLICY "chat_messages_select_own" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_messages_insert_own" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_messages_update_service_role" ON public.chat_messages;
CREATE POLICY "chat_messages_update_service_role" ON public.chat_messages
  FOR UPDATE TO service_role
  USING (true);

-- 9. pg_cron: 90일 후 자동 삭제
DO $$
DECLARE
  v_existing_job_id integer;
BEGIN
  -- chat_sessions 정리 job (cascade로 chat_messages도 삭제됨)
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'chat_sessions_cleanup_90d'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'chat_sessions_cleanup_90d',
    '40 15 * * *',
    $job$
      DELETE FROM public.chat_sessions
      WHERE created_at < now() - INTERVAL '90 days';
    $job$
  );
END;
$$;
