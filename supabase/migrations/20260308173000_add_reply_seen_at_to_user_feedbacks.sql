ALTER TABLE public.user_feedbacks
ADD COLUMN IF NOT EXISTS reply_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_feedbacks.reply_seen_at IS '사용자가 관리자 답변을 확인한 시각';
