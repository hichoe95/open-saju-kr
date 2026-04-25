CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens(token_hash);

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refresh_tokens_service_only" ON public.refresh_tokens
    FOR ALL USING (false);
