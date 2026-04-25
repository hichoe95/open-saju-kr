CREATE TABLE IF NOT EXISTS public.received_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sharer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sharer_name VARCHAR(100),
  birth_date_ct TEXT NOT NULL,
  birth_date_iv TEXT NOT NULL,
  birth_date_tag TEXT NOT NULL,
  hour_branch_ct TEXT NOT NULL,
  hour_branch_iv TEXT NOT NULL,
  hour_branch_tag TEXT NOT NULL,
  calendar_type_ct TEXT NOT NULL,
  calendar_type_iv TEXT NOT NULL,
  calendar_type_tag TEXT NOT NULL,
  gender_ct TEXT NOT NULL,
  gender_iv TEXT NOT NULL,
  gender_tag TEXT NOT NULL,
  key_id TEXT NOT NULL,
  persona VARCHAR(20) DEFAULT 'classic',
  source_share_code VARCHAR(10),
  source_profile_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_received_profiles_receiver
ON public.received_profiles(receiver_user_id);

CREATE INDEX IF NOT EXISTS idx_received_profiles_share_code
ON public.received_profiles(source_share_code);

ALTER TABLE public.received_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "received_profiles_select_own" ON public.received_profiles;
CREATE POLICY "received_profiles_select_own" ON public.received_profiles
  FOR SELECT
  USING (receiver_user_id = auth.uid());

DROP POLICY IF EXISTS "received_profiles_insert_own" ON public.received_profiles;
CREATE POLICY "received_profiles_insert_own" ON public.received_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (receiver_user_id = auth.uid());

DROP POLICY IF EXISTS "received_profiles_delete_own" ON public.received_profiles;
CREATE POLICY "received_profiles_delete_own" ON public.received_profiles
  FOR DELETE
  USING (receiver_user_id = auth.uid());
