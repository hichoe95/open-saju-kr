ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS toss_secret TEXT;

CREATE TABLE IF NOT EXISTS public.profile_unlock_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.saju_profiles(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_unlock_claims_user_id
ON public.profile_unlock_claims(user_id);

CREATE INDEX IF NOT EXISTS idx_profile_unlock_claims_profile_id
ON public.profile_unlock_claims(profile_id);

ALTER TABLE public.profile_unlock_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_unlock_claims_service_only_select ON public.profile_unlock_claims;
DROP POLICY IF EXISTS profile_unlock_claims_service_only_insert ON public.profile_unlock_claims;

CREATE POLICY profile_unlock_claims_service_only_select
ON public.profile_unlock_claims
FOR SELECT
USING (false);

CREATE POLICY profile_unlock_claims_service_only_insert
ON public.profile_unlock_claims
FOR INSERT
WITH CHECK (false);

REVOKE ALL ON TABLE public.profile_unlock_claims FROM PUBLIC;
REVOKE ALL ON TABLE public.profile_unlock_claims FROM anon;
REVOKE ALL ON TABLE public.profile_unlock_claims FROM authenticated;
GRANT ALL ON TABLE public.profile_unlock_claims TO service_role;
