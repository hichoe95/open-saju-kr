-- ============================================
-- reference_id UUID → TEXT 변환 마이그레이션
-- 2026-01-25
-- 
-- 문제: coin_transactions.reference_id가 UUID 타입인데,
--       RPC 함수들이 TEXT로 전달하여 타입 불일치 발생
-- 해결: reference_id를 TEXT로 변환 (더 유연한 참조 지원)
-- ============================================

-- 1. 기존 인덱스 삭제 (reference_id 관련)
DROP INDEX IF EXISTS public.idx_coin_transactions_single_refund;
DROP INDEX IF EXISTS public.idx_coin_transactions_reference;

-- 2. reference_id 타입을 TEXT로 변경
ALTER TABLE public.coin_transactions
  ALTER COLUMN reference_id TYPE TEXT
  USING reference_id::text;

-- 3. 부분 유니크 인덱스 재생성 (환불 중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_single_refund
ON public.coin_transactions (reference_id)
WHERE type = 'refund' AND reference_id IS NOT NULL;

-- 4. 일반 조회용 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_coin_transactions_reference
ON public.coin_transactions (reference_id)
WHERE reference_id IS NOT NULL;

-- 5. RPC 함수들은 이미 p_reference_id TEXT로 선언되어 있으므로
--    이제 타입이 일치함. 추가 수정 불필요.
