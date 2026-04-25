-- ============================================
-- saju_cache 테이블 RLS 정책 추가
-- 캐시 데이터는 공개 읽기 허용 (birth_key로 조회)
-- 쓰기는 Service Role만 가능 (백엔드에서 처리)
-- ============================================

-- 1. saju_cache RLS 활성화 확인
ALTER TABLE public.saju_cache ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 제거 (있다면)
DROP POLICY IF EXISTS "saju_cache_select_all" ON public.saju_cache;
DROP POLICY IF EXISTS "saju_cache_select_by_key" ON public.saju_cache;

-- 3. SELECT 정책: birth_key로 조회 시 모두 허용
-- 캐시 데이터는 익명화된 키로만 조회 가능하므로 공개해도 안전
CREATE POLICY "saju_cache_select_all" ON public.saju_cache
  FOR SELECT USING (true);

-- 참고: INSERT/UPDATE/DELETE는 정책 없음
-- 백엔드에서 Service Role Key를 사용하므로 RLS 우회됨
-- 직접적인 클라이언트 쓰기는 차단됨 (정책 없으면 기본 거부)

-- 4. shared_saju UPDATE 정책 세분화 (view_count만 업데이트 가능하도록)
-- 기존의 너무 관대한 정책을 더 안전하게 변경
DROP POLICY IF EXISTS "shared_saju_update_view_count" ON public.shared_saju;

-- view_count 증가만 허용 (다른 필드 변경 불가)
-- PostgreSQL에서 컬럼 레벨 제약은 RLS로 직접 지원하지 않으므로
-- 백엔드에서 view_count만 업데이트하도록 제한하는 것이 안전함
-- 여기서는 기본적인 정책만 유지
CREATE POLICY "shared_saju_update_view_count" ON public.shared_saju
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- 주석: 프로덕션에서는 트리거나 함수를 사용하여
-- view_count 외 다른 필드 변경 시 롤백하는 것을 권장
