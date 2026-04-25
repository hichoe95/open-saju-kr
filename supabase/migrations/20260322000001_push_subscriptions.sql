CREATE TABLE public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sent_at TIMESTAMPTZ,
    failure_count INT NOT NULL DEFAULT 0,
    CONSTRAINT unique_user_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_push_subs_active ON public.push_subscriptions(is_active) WHERE is_active = TRUE;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subs_service
ON public.push_subscriptions
FOR ALL
USING (true)
WITH CHECK (true);
