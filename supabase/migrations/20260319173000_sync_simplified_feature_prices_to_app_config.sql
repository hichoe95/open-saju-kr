INSERT INTO app_config (key, value, description, updated_at)
VALUES
  ('reading_reanalyze', '150', '사주 재분석 가격 (엽전)', now()),
  ('ai_chat', '10', 'AI 도사 상담 첫 질문 가격 (엽전)', now()),
  ('ai_chat_followup', '10', 'AI 도사 상담 후속 질문 가격 (엽전)', now()),
  ('compatibility', '50', '궁합 분석 가격 (엽전)', now()),
  ('flow_ai_advice', '20', 'AI 조언 가격 (엽전)', now()),
  ('saju_image', '50', '사주 이미지 생성 가격 (엽전)', now()),
  ('daily_fortune_price', '20', '오늘의 운세 가격 (엽전)', now())
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
