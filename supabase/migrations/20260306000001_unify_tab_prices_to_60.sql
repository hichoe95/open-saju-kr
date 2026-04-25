INSERT INTO public.app_config (key, value, description, updated_at)
VALUES
  ('tab_love', '60', '연애 탭 영구 해제 가격 (엽전)', now()),
  ('tab_money', '60', '금전 탭 영구 해제 가격 (엽전)', now()),
  ('tab_compatibility', '60', '관계 탭 영구 해제 가격 (엽전)', now()),
  ('tab_career', '60', '직장 탭 영구 해제 가격 (엽전)', now()),
  ('tab_flow_calendar', '60', '기운 캘린더 해제 가격 (엽전)', now())
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
