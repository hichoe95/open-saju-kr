-- Admin Dashboard 기능을 위한 마이그레이션
-- 1. users 테이블에 is_admin 컬럼 추가
-- 2. app_config 테이블 생성 (앱 설정 관리)

-- ============================================================
-- 1. is_admin 컬럼 추가
-- ============================================================
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.users.is_admin IS '관리자 여부';


-- ============================================================
-- 2. app_config 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES public.users(id)
);

COMMENT ON TABLE public.app_config IS '앱 설정 (관리자만 수정 가능)';

-- RLS 활성화
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- 읽기는 모든 인증된 사용자, 쓰기는 관리자만
CREATE POLICY "app_config_select_authenticated" ON public.app_config
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "app_config_all_admin" ON public.app_config
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE)
    );

-- ============================================================
-- 3. 기본 설정값 삽입
-- ============================================================
INSERT INTO public.app_config (key, value, description) VALUES
    ('default_model', '"gpt-5.2"', '기본 분석 모델'),
    ('default_reasoning_effort', '"low"', '기본 추론 강도 (none/low/medium/high)'),
    ('default_persona', '"classic"', '기본 페르소나 (mz/classic/warm/witty)'),
    ('free_analysis_count', '1', '무료 분석 횟수'),
    ('ai_advice_price', '30', 'AI 조언 가격 (엽전)'),
    ('compatibility_price', '50', '궁합 분석 가격 (엽전)'),
    ('decision_price', '20', '결정 분석 가격 (엽전)'),
    ('signup_bonus_coins', '100', '가입 보너스 엽전'),
    ('maintenance_mode', 'false', '점검 모드 활성화'),
    ('announcement', '""', '공지사항 메시지')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_app_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_config_updated_at ON public.app_config;
CREATE TRIGGER app_config_updated_at
    BEFORE UPDATE ON public.app_config
    FOR EACH ROW
    EXECUTE FUNCTION update_app_config_updated_at();
