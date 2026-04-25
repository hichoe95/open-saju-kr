-- Adds context_json to store user-specific concern/context.

ALTER TABLE public.user_readings
ADD COLUMN IF NOT EXISTS context_json jsonb;
