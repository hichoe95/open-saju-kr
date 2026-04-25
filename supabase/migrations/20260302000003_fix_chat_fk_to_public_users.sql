-- ============================================
-- FK Reference Fix: auth.users → public.users
-- Issue: chat_sessions, tab_engagement_events, session_funnel_events
--        FK가 auth.users를 참조하지만 실제 인증은 public.users 사용
-- ============================================
-- 
-- ⚠️ 배포 전 반드시 실행:
-- SELECT * FROM check_orphan_rows_before_fk_fix();
-- 결과가 0이어야 마이그레이션 진행 가능
--
-- 🔒 안전한 배포 순서:
-- 1. NOT VALID로 FK 추가 (쓰기 중단 없음)
-- 2. 오프피크에 VALIDATE CONSTRAINT 실행
-- ============================================

-- ============================================
-- 사전 검증 함수 (배포 전 실행 필수)
-- ============================================
CREATE OR REPLACE FUNCTION check_orphan_rows_before_fk_fix()
RETURNS TABLE (
    table_name TEXT,
    orphan_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'chat_sessions'::TEXT, COUNT(*)::BIGINT
    FROM chat_sessions cs
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = cs.user_id)
    UNION ALL
    SELECT 'tab_engagement_events'::TEXT, COUNT(*)::BIGINT
    FROM tab_engagement_events tee
    WHERE tee.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = tee.user_id)
    UNION ALL
    SELECT 'session_funnel_events'::TEXT, COUNT(*)::BIGINT
    FROM session_funnel_events sfe
    WHERE sfe.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = sfe.user_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 1. chat_sessions 테이블 FK 수정
-- ============================================

-- 기존 FK 제거 (auth.users 참조)
ALTER TABLE public.chat_sessions
DROP CONSTRAINT IF EXISTS chat_sessions_user_id_fkey;

-- 새 FK 생성 (public.users 참조) - NOT VALID로 먼저 추가
ALTER TABLE public.chat_sessions
ADD CONSTRAINT chat_sessions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
NOT VALID;

-- ============================================
-- 2. tab_engagement_events 테이블 FK 수정
-- ============================================

-- 기존 FK 제거 (auth.users 참조)
ALTER TABLE public.tab_engagement_events
DROP CONSTRAINT IF EXISTS tab_engagement_events_user_id_fkey;

-- 새 FK 생성 (public.users 참조) - NOT VALID로 먼저 추가
ALTER TABLE public.tab_engagement_events
ADD CONSTRAINT tab_engagement_events_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
NOT VALID;

-- ============================================
-- 3. session_funnel_events 테이블 FK 수정
-- ============================================

-- 기존 FK 제거 (auth.users 참조)
ALTER TABLE public.session_funnel_events
DROP CONSTRAINT IF EXISTS session_funnel_events_user_id_fkey;

-- 새 FK 생성 (public.users 참조) - NOT VALID로 먼저 추가
ALTER TABLE public.session_funnel_events
ADD CONSTRAINT session_funnel_events_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
NOT VALID;

-- ============================================
-- 검증 가이드 (수동 실행)
-- ============================================
/*
-- Step 1: orphan row 확인
SELECT * FROM check_orphan_rows_before_fk_fix();

-- Step 2: orphan이 0이면 VALIDATE 실행 (오프피크 권장)
-- ALTER TABLE public.chat_sessions VALIDATE CONSTRAINT chat_sessions_user_id_fkey;
-- ALTER TABLE public.tab_engagement_events VALIDATE CONSTRAINT tab_engagement_events_user_id_fkey;
-- ALTER TABLE public.session_funnel_events VALIDATE CONSTRAINT session_funnel_events_user_id_fkey;

-- Step 3: FK 상태 확인
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    tc.constraint_name,
    (SELECT NOT VALID FROM pg_constraint WHERE conname = tc.constraint_name) as not_valid
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('chat_sessions', 'tab_engagement_events', 'session_funnel_events');
*/

-- ============================================
-- 롤백 가이드 (문제 발생 시)
-- ============================================
/*
-- FK 복원 (auth.users로)
-- ALTER TABLE public.chat_sessions DROP CONSTRAINT chat_sessions_user_id_fkey;
-- ALTER TABLE public.chat_sessions ADD CONSTRAINT chat_sessions_user_id_fkey
--     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ALTER TABLE public.tab_engagement_events DROP CONSTRAINT tab_engagement_events_user_id_fkey;
-- ALTER TABLE public.tab_engagement_events ADD CONSTRAINT tab_engagement_events_user_id_fkey
--     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ALTER TABLE public.session_funnel_events DROP CONSTRAINT session_funnel_events_user_id_fkey;
-- ALTER TABLE public.session_funnel_events ADD CONSTRAINT session_funnel_events_user_id_fkey
--     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
*/
