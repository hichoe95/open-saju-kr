-- 20260220000001_add_feature_model_configs.sql
-- 7가지 분석 영역별 기본 모델 설정을 app_config 테이블에 추가합니다.

INSERT INTO public.app_config (key, value, description, updated_at)
VALUES 
    ('model_free', 'gpt-4.1-mini', '무료 체험하기 모델', now()),
    ('model_main', 'gpt-5.4-mini', '결과보기(메인) 모델', now()),
    ('model_compatibility', 'gpt-5.4-mini', '궁합 분석 모델', now()),
    ('model_decision', 'gemini-3-flash-preview', 'AI에게 질문하기 모델', now()),
    ('model_flow', 'gpt-5.4-mini', '운세 흐름 모델', now()),
    ('model_daily_fortune', 'gpt-5.4-mini', '오늘의 운세 모델', now()),
    ('model_seun', 'gemini-3-flash-preview', '세운 분석 모델', now())
ON CONFLICT (key) DO NOTHING;
