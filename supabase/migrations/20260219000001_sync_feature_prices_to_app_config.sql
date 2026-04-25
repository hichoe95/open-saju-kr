INSERT INTO public.app_config (key, value, description, updated_at)
VALUES
  ('reading_reanalyze', '350', '사주 재분석 가격 (엽전)', now()),
  ('flow_ai_advice', '30', '기운 캘린더 AI 조언 가격 (엽전)', now()),
  ('ai_chat', '50', 'AI 도사 상담 가격 (엽전)', now()),
  ('compatibility', '100', '궁합 분석 가격 (엽전)', now()),
  ('tab_love', '100', '연애 탭 영구 해제 가격 (엽전)', now()),
  ('tab_money', '100', '금전 탭 영구 해제 가격 (엽전)', now()),
  ('tab_compatibility', '100', '관계 탭 영구 해제 가격 (엽전)', now()),
  ('tab_career', '50', '직장 탭 영구 해제 가격 (엽전)', now())
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
