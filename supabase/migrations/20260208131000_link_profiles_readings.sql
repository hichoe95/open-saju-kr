-- Link saved profiles to generated readings/caches for stable DB retrieval

ALTER TABLE public.saju_profiles
ADD COLUMN IF NOT EXISTS cache_id uuid REFERENCES public.saju_cache(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saju_profiles_cache_id
ON public.saju_profiles(cache_id);

ALTER TABLE public.user_readings
ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.saju_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_readings_profile_id_created_at
ON public.user_readings(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_readings_user_label_persona_created_at
ON public.user_readings(user_id, label, persona, created_at DESC);
